// ==========================================
// MappAI TTS Reader — lettura ad alta voce compensativa (BES/DSA)
// ==========================================
// Motore di sintesi vocale RIUSABILE + controllo a chip (−10s / play-pausa /
// +5s / velocità) con BARRA DI AVANZAMENTO scrubabile, EVIDENZIAZIONE karaoke
// della frase letta e AVVIO PER SEZIONE. Attivato dal toggle "Ascolto testo"
// nel pannello Strumenti Compensativi (localStorage `mappai_tts_tool_enabled`).
//
// Ogni modale che espone uno slot `.mai-tts-slot` (con `data-tts-body="#sel"`)
// riceve automaticamente il controllo. `data-tts-sections` sullo slot aggiunge
// un pulsante ▶ "ascolta da qui" davanti a ogni titolo del corpo.
//
// Scelte di design per l'accessibilità:
//  - Testo parlato SENZA numeri di nota [1],[2]… (velenosi per il TTS) e senza il
//    blocco "Fonti/Sources": strippati dall'audio ma lasciati visibili a schermo.
//  - Prosodia dinamica entro i limiti Web Speech: lettura frase-per-frase, pause
//    fra frasi/paragrafi, pausa lunga dopo i titoli, pitch alto sulle domande.
//  - EVIDENZIAZIONE karaoke della frase in lettura (CSS Custom Highlight API →
//    nessuna mutazione del DOM, le note [n] restano cliccabili; fallback: classe
//    sul blocco corrente) + scroll morbido per seguirla.
//  - BARRA DI AVANZAMENTO: click/trascina per riprendere da un punto qualsiasi
//    senza riascoltare da capo. Seek anche sub-frase.
// Caricato DOPO mappai-a11y.js. Nessun ES module (script globale, pattern del repo).
(function () {
    'use strict';

    var LS_ENABLED = 'mappai_tts_tool_enabled';
    var LS_RATE_IDX = 'mappai_tts_rate_idx';
    var SPEEDS = [0.75, 1, 1.25, 1.5];
    var BACK_SEC = 10;
    var FWD_SEC = 5;
    var CPS_BASE = 14.5; // caratteri/secondo stimati a rate 1.0 (italiano) — per la timeline
    // Effetti karaoke (17/9/26): come si segue la lettura. `frase` è quello di
    // sempre; gli altri lavorano PAROLA per parola.
    var LS_EFFECT = 'mappai_tts_effetto';
    var EFFECTS = ['frase', 'sottolinea', 'parola', 'rsvp'];
    var FX_ICON = { frase: 'highlighter', sottolinea: 'underline', parola: 'sun-dim', rsvp: 'focus' };
    // Grandezza del pannello flottante: ×1 com'era, ×1.5 più largo e meno righe,
    // ×2 largo quanto lo schermo e UNA riga che scorre.
    var LS_SCALE = 'mappai_tts_scala';
    var SCALES = [1, 1.5, 2];

    function _t(k, f) { try { return (window.t ? window.t(k, f) : f) || f; } catch (e) { return f; } }
    function _icons() { try { if (window.safeCreateIcons) window.safeCreateIcons(); } catch (e) {} }

    function isEnabled() { try { return localStorage.getItem(LS_ENABLED) === '1'; } catch (e) { return false; } }
    function _rateIdx() {
        try { var n = parseInt(localStorage.getItem(LS_RATE_IDX), 10); return (n >= 0 && n < SPEEDS.length) ? n : 1; }
        catch (e) { return 1; }
    }
    function _setRateIdx(i) { try { localStorage.setItem(LS_RATE_IDX, String(i)); } catch (e) {} }
    function _rate() { return SPEEDS[_rateIdx()]; }
    function _effect() { try { var v = localStorage.getItem(LS_EFFECT); return EFFECTS.indexOf(v) >= 0 ? v : 'frase'; } catch (e) { return 'frase'; } }
    function _scale() { try { var n = parseFloat(localStorage.getItem(LS_SCALE)); return SCALES.indexOf(n) >= 0 ? n : 1; } catch (e) { return 1; } }
    function _fxLabel(fx) {
        return ({
            frase: _t('tts_fx_frase', 'Effetto: evidenzia la frase'),
            sottolinea: _t('tts_fx_sottolinea', 'Effetto: sottolinea la parola'),
            parola: _t('tts_fx_parola', 'Effetto: in chiaro solo la parola letta'),
            rsvp: _t('tts_fx_rsvp', 'Effetto: una parola alla volta')
        })[fx];
    }

    var supported = ('speechSynthesis' in window) && ('SpeechSynthesisUtterance' in window);

    // ── Voci ────────────────────────────────────────────────────────────────
    var _voices = [];
    function _refreshVoices() { try { _voices = window.speechSynthesis.getVoices() || []; } catch (e) { _voices = []; } }
    if (supported) { _refreshVoices(); try { window.speechSynthesis.onvoiceschanged = _refreshVoices; } catch (e) {} }
    function _langFor(el) {
        try { var host = el && el.closest ? el.closest('[lang]') : null; if (host && /^en/i.test(host.getAttribute('lang') || '')) return 'en-US'; } catch (e) {}
        try { var ml = window.getMapLanguage && window.getMapLanguage(); if (ml === 'en') return 'en-US'; } catch (e) {}
        return 'it-IT';
    }
    function _pickVoice(lang) {
        if (!_voices.length) _refreshVoices();
        var pre = lang.slice(0, 2).toLowerCase();
        var exact = _voices.filter(function (v) { return (v.lang || '').toLowerCase().replace('_', '-') === lang.toLowerCase(); });
        if (exact.length) return exact[0];
        var loose = _voices.filter(function (v) { return (v.lang || '').toLowerCase().indexOf(pre) === 0; });
        return loose.length ? loose[0] : null;
    }

    // ── Highlight (CSS Custom Highlight API) ───────────────────────────────
    // Un registro per DOCUMENTO (17/9/26). Il testo da leggere può stare in un
    // iframe — la sintesi nel dock di MappAI studente, i documenti di ELABORA —
    // e lì i Range si dipingono solo se Highlight, `::highlight` e le classi
    // del karaoke vivono in QUEL documento: registrati nella pagina dell'app
    // non si vedeva niente.
    function _hlOf(doc) {
        doc = doc || document;
        if (doc.__maiTtsHl) return doc.__maiTtsHl;
        var w = doc.defaultView || window, h = { ok: false, read: null, u: null, lit: null };
        try {
            if (w.CSS && w.CSS.highlights && typeof w.Highlight !== 'undefined') {
                h.read = new w.Highlight(); w.CSS.highlights.set('mai-tts-read', h.read);
                // registrate DOPO la frase: a parità di priorità vince l'ultima
                h.u = new w.Highlight(); w.CSS.highlights.set('mai-tts-word-u', h.u);
                h.lit = new w.Highlight(); w.CSS.highlights.set('mai-tts-word-lit', h.lit);
                h.ok = true;
            }
        } catch (e) { h.ok = false; }
        if (doc !== document) _injectCss(doc);
        try { doc.__maiTtsHl = h; } catch (e) {}
        return h;
    }

    // ── Pulizia testo ──────────────────────────────────────────────────────
    function _cleanLine(s) {
        var t = String(s || '')
            .replace(/\[\d+\]/g, ' ')
            .replace(/[*_`#]+/g, ' ')
            .replace(/ /g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/\s+([.,;:!?…»)\]])/g, '$1')
            .trim();
        // come va DETTO (17/9/26): «d.C.» → «dopo Cristo», «Cai Lun» non diventa
        // «Cai Lunedì». Solo la voce: lo schermo resta com'è.
        var P = window.MappAIPronunciaCore;
        return P && P.perVoce ? P.perVoce(t, E.lang) : t;
    }

    // Testo + mappa dei nodi testuali di un blocco, saltando note/citazioni/controlli.
    function _blockPieces(block) {
        var walker = (block.ownerDocument || document).createTreeWalker(block, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                var p = n.parentNode;
                while (p && p !== block) {
                    if (p.nodeType === 1) {
                        var tag = p.tagName.toLowerCase();
                        if (tag === 'sup' || tag === 'annotation' || tag === 'button' || tag === 'style' || tag === 'script') return NodeFilter.FILTER_REJECT;
                        if (p.classList && (p.classList.contains('bs-citations') || p.classList.contains('mai-tts-wrap') || p.hasAttribute('data-tts-skip'))) return NodeFilter.FILTER_REJECT;
                    }
                    p = p.parentNode;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        var text = '', map = [], n;
        while ((n = walker.nextNode())) {
            var v = n.nodeValue || '';
            map.push({ node: n, start: text.length, len: v.length });
            text += v;
        }
        return { text: text, map: map };
    }
    function _locate(map, pos) {
        for (var i = 0; i < map.length; i++) {
            var pc = map[i];
            if (pos >= pc.start && pos <= pc.start + pc.len) return { node: pc.node, offset: pos - pc.start };
        }
        var last = map[map.length - 1];
        return last ? { node: last.node, offset: last.len } : null;
    }
    // Le parole di una frase in DUE elenchi che combaciano uno a uno: gli
    // intervalli nel testo del DOM (per evidenziare) e gli inizi nel testo
    // PARLATO (per tradurre il `charIndex` della voce). Conta solo ciò che ha
    // una lettera o una cifra DOPO la stessa pulizia del parlato: un `[1]` o un
    // `**` isolati non spostano di una parola tutto quello che viene dopo.
    var _PAROLA;
    try { _PAROLA = new RegExp('[\\p{L}\\p{N}]', 'u'); } catch (e) { _PAROLA = /[0-9A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/; }
    function _isWord(w) { return _PAROLA.test(w); }
    function _wordRanges(text, hs, he) {
        var out = [], re = /\S+/g, seg = text.slice(hs, he), m;
        while ((m = re.exec(seg))) {
            var n = _cleanLine(m[0]).split(' ').filter(_isWord).length;
            for (var k = 0; k < n; k++) out.push({ s: hs + m.index, e: hs + m.index + m[0].length });
        }
        return out;
    }
    function _spokenWords(speech) {
        var out = [], re = /\S+/g, m;
        while ((m = re.exec(speech))) { if (_isWord(m[0])) out.push({ at: m.index, w: m[0] }); }
        return out;
    }
    function _spokenIndexAt(c, pos) {
        var k = 0, sp = c.spoken || [];
        for (var i = 0; i < sp.length; i++) { if (sp[i].at <= pos) k = i; else break; }
        return k;
    }

    // Divide un testo in intervalli-frase [start,end) preservando la punteggiatura.
    // Una frase finisce su . ! ? … seguiti da uno spazio o dalla fine: non dentro
    // «3.14», e non dopo un'abbreviazione (d.C., ecc., J.) — prima «Nel 105 d.»
    // era una frase da sola, letta e evidenziata a metà.
    function _sentenceRanges(text) {
        var re = /[.!?…]+[)\]"'”’»]*(?:\s+|$)/g, res = [], last = 0, m, P = window.MappAIPronunciaCore;
        while ((m = re.exec(text))) {
            var end = m.index + m[0].length;
            if (P && P.abbreviazione && end < text.length) {
                var da = m.index; while (da > 0 && !/\s/.test(text.charAt(da - 1))) da--;
                if (P.abbreviazione(text.slice(da, m.index + m[0].replace(/\s+$/, '').length), E.lang)) continue;
            }
            res.push({ start: last, end: end }); last = end;
        }
        if (last < text.length) res.push({ start: last, end: text.length });
        if (!res.length) res.push({ start: 0, end: text.length });
        return res;
    }

    // Costruisce i chunk dal corpo LIVE, ciascuno con il proprio Range per il karaoke.
    function _buildChunks(bodyEl) {
        if (!bodyEl) return [];
        var chunks = [];
        var blocks = bodyEl.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote');
        var list = blocks.length ? blocks : [bodyEl];
        for (var bi = 0; bi < list.length; bi++) {
            var block = list[bi];
            // Materiale generato (citazioni, catena dei perché, box) e comandi
            // dell'interfaccia: muti. `data-ap-skip` è lo stesso marcatore che
            // usa il lettore dentro l'HTML esportato — una regola sola.
            if (block.closest && (block.closest('.bs-citations') || block.closest('[data-ap-skip]'))) continue;
            var pieces = _blockPieces(block);
            if (!pieces.text.trim()) continue;
            var tag = block.tagName ? block.tagName.toLowerCase() : 'p';
            var heading = /^h[1-6]$/.test(tag), item = (tag === 'li');

            var ranges = heading ? [{ start: 0, end: pieces.text.length }] : _sentenceRanges(pieces.text);
            for (var ri = 0; ri < ranges.length; ri++) {
                var rg = ranges[ri];
                var raw = pieces.text.slice(rg.start, rg.end);
                var speech = _cleanLine(raw);
                if (!speech) continue;
                // trim trailing whitespace dall'intervallo di evidenziazione
                var hs = rg.start, he = rg.end;
                while (he > hs && /\s/.test(pieces.text.charAt(he - 1))) he--;
                while (hs < he && /\s/.test(pieces.text.charAt(hs))) hs++;
                var a = _locate(pieces.map, hs), b = _locate(pieces.map, he);

                var pitch = 1.0, pause = 200, rateMul = 1.0;
                if (heading) { rateMul = 0.94; pause = 400; }
                else {
                    if (/[?？]\s*$/.test(raw)) { pitch = 1.09; pause = 260; }
                    else if (/[!！]\s*$/.test(raw)) { pitch = 1.04; pause = 240; }
                    if (item) pause = Math.max(pause, 220);
                    if (ri === ranges.length - 1) pause += 150;
                }
                chunks.push({
                    text: speech, kind: heading ? 'heading' : 'sentence',
                    endPause: pause, pitch: pitch, rateMul: rateMul, srcNode: block,
                    r: (a && b) ? { sN: a.node, sO: a.offset, eN: b.node, eO: b.offset } : null,
                    map: pieces.map, words: _wordRanges(pieces.text, hs, he), spoken: _spokenWords(speech)
                });
            }
        }
        return chunks;
    }

    // ── Motore (singleton) ──────────────────────────────────────────────────
    var E = {
        wrap: null, bodyEl: null, lang: 'it-IT',
        chunks: [], durations: [], starts: [], total: 0,
        idx: 0, subChar: 0, chunkT0: 0, playing: false,
        gapTimer: null, utter: null, ticker: null, blockEl: null, dragging: false,
        wordIdx: -1, bnd: false, rsvpEl: null, hl: { ok: false }
    };

    function _recomputeTiming() {
        var rate = _rate();
        E.durations = E.chunks.map(function (c) {
            var cps = CPS_BASE * rate * (c.rateMul || 1);
            return Math.max(0.35, c.text.length / cps) + (c.endPause || 0) / 1000;
        });
        E.starts = []; var acc = 0;
        for (var i = 0; i < E.durations.length; i++) { E.starts[i] = acc; acc += E.durations[i]; }
        E.total = acc;
    }
    function _load(wrap) {
        E.wrap = wrap;
        E.bodyEl = wrap._resolveBody();
        E.hl = _hlOf(E.bodyEl && E.bodyEl.ownerDocument);
        E.lang = _langFor(E.bodyEl);
        E.chunks = _buildChunks(E.bodyEl);
        E.idx = 0; E.subChar = 0;
        _recomputeTiming();
    }
    function _clearGap() { if (E.gapTimer) { clearTimeout(E.gapTimer); E.gapTimer = null; } }

    function _visible(el) {
        try {
            if (!el || !el.isConnected) return false;
            var box = el.getBoundingClientRect();
            return el.offsetParent !== null || (box.width > 0 && box.height > 0);
        } catch (e) { return true; }
    }

    // ── Highlight karaoke ───────────────────────────────────────────────────
    function _clearHighlight() {
        try { if (E.hl.ok) { E.hl.read.clear(); E.hl.u.clear(); E.hl.lit.clear(); } } catch (e) {}
        if (E.blockEl) { try { E.blockEl.classList.remove('mai-tts-block'); } catch (e) {} E.blockEl = null; }
        try { if (E.bodyEl && E.bodyEl.classList) E.bodyEl.classList.remove('mai-tts-fx-parola'); } catch (e) {}
        E.wordIdx = -1;
    }
    // A ×1.5 e ×2 il corpo mostra un numero ESATTO di righe (3 e 1): lo
    // scorrimento va a righe intere, mai a metà.
    function _lineMode() {
        try {
            var f = E.bodyEl && E.bodyEl.closest ? E.bodyEl.closest('.mai-tts-float') : null;
            if (!f) return 0;
            return f.classList.contains('mai-tts-float--x2') ? 2 : (f.classList.contains('mai-tts-float--x15') ? 1.5 : 0);
        } catch (e) { return 0; }
    }
    function _highlight(i) {
        _clearHighlight();
        var ch = E.chunks[i]; if (!ch) return;
        // «in chiaro solo la parola» senza Highlight API sarebbe tutto spento:
        // lì resta la frase evidenziata
        var fx = _effect();
        if (fx === 'parola' && E.hl.ok) {
            if (E.bodyEl && E.bodyEl.classList) E.bodyEl.classList.add('mai-tts-fx-parola');
        } else {
            if (ch.srcNode && ch.srcNode.classList) { ch.srcNode.classList.add('mai-tts-block'); E.blockEl = ch.srcNode; }
            if (E.hl.ok && ch.r) {
                try { var r = ch.r.sN.ownerDocument.createRange(); r.setStart(ch.r.sN, ch.r.sO); r.setEnd(ch.r.eN, ch.r.eO); E.hl.read.add(r); } catch (e) {}
            }
        }
        if (fx !== 'rsvp') _rsvpHide();
        if (_lineMode()) return; // le righe le allinea _follow, parola per parola
        try { if (ch.srcNode && ch.srcNode.scrollIntoView) ch.srcNode.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
    }

    // ── La parola letta ─────────────────────────────────────────────────────
    // Arriva dalla voce (`boundary`, quando il motore la manda) o dalla stima
    // sul tempo (ticker): evidenzia secondo l'effetto, tiene la riga in vista,
    // aggiorna la striscia «una parola alla volta».
    function _word(k) {
        var ch = E.chunks[E.idx]; if (!ch || !ch.words || !ch.words.length) return;
        k = Math.max(0, Math.min(k, ch.words.length - 1));
        if (k === E.wordIdx) return;
        E.wordIdx = k;
        var fx = _effect(), wr = ch.words[k], range = null;
        try { if (E.hl.ok) { E.hl.u.clear(); E.hl.lit.clear(); } } catch (e) {}
        var a = _locate(ch.map, wr.s), b = _locate(ch.map, wr.e);
        if (a && b) { try { range = a.node.ownerDocument.createRange(); range.setStart(a.node, a.offset); range.setEnd(b.node, b.offset); } catch (e) { range = null; } }
        if (range && E.hl.ok) {
            try { if (fx === 'sottolinea') E.hl.u.add(range); else if (fx === 'parola') E.hl.lit.add(range); } catch (e) {}
        }
        if (fx === 'rsvp') _rsvpShow(ch.spoken && ch.spoken[k] ? ch.spoken[k].w : _cleanLine(ch.text.split(' ')[k] || ''));
        if (range) _follow(range);
    }
    function _estimateWord() {
        var c = E.chunks[E.idx]; if (!c || !c.spoken || !c.spoken.length) return;
        var dur = Math.max(0.2, (E.durations[E.idx] || 0) - (c.endPause || 0) / 1000);
        var el = Math.max(0, (_now() - E.chunkT0) / 1000);
        _word(_spokenIndexAt(c, Math.min(c.text.length - 1, Math.floor(el / dur * c.text.length))));
    }
    // Tiene in vista la riga della parola. A ×2 la riga è UNA e si allinea a
    // ogni parola; a ×1.5 quando la parola esce dalle tre righe, la sua riga
    // diventa la prima.
    function _follow(range) {
        var sc = E.bodyEl; if (!sc || sc.scrollHeight <= sc.clientHeight + 2) return;
        var rb, bb;
        try { rb = range.getBoundingClientRect(); bb = sc.getBoundingClientRect(); } catch (e) { return; }
        if (!rb || (!rb.width && !rb.height)) return;
        var top = rb.top - bb.top + sc.scrollTop, lm = _lineMode();
        if (lm) {
            var lh = rb.height;
            try { var pn = range.startContainer.parentNode; lh = parseFloat(pn.ownerDocument.defaultView.getComputedStyle(pn).lineHeight) || rb.height; } catch (e) {}
            var target = Math.max(0, Math.round(top - (lh - rb.height) / 2));
            var fuori = rb.top < bb.top - 1 || rb.bottom > bb.bottom + 1;
            if ((lm === 2 || fuori) && Math.abs(sc.scrollTop - target) > 2) sc.scrollTop = target;
        } else if (rb.top < bb.top || rb.bottom > bb.bottom) {
            var to = Math.max(0, top - bb.height / 3);
            try { sc.scrollTo({ top: to, behavior: 'smooth' }); } catch (e) { sc.scrollTop = to; }
        }
    }
    // La striscia RSVP: sopra il corpo che si legge (nel modale sotto la barra,
    // nel pannello flottante sopra il testo).
    function _rsvpShow(w) {
        if (!E.bodyEl || !E.bodyEl.parentNode) return;
        var st = E.rsvpEl;
        if (!st || !st.isConnected || st.nextSibling !== E.bodyEl) {
            _rsvpHide();
            st = document.createElement('div');
            st.className = 'mai-rsvp mai-tts-rsvp';
            st.setAttribute('aria-hidden', 'true'); // la voce legge già: niente doppioni allo screen reader
            E.bodyEl.parentNode.insertBefore(st, E.bodyEl);
            E.rsvpEl = st;
        }
        var C = window.MappAIRsvpCore;
        if (C && C.html) st.innerHTML = C.html(w);
        else st.textContent = w;
    }
    function _rsvpHide() { if (E.rsvpEl) { try { E.rsvpEl.remove(); } catch (e) {} E.rsvpEl = null; } }

    // ── Riproduzione ────────────────────────────────────────────────────────
    function _speakCurrent() {
        if (E.idx >= E.chunks.length) { _finish(); return; }
        if (E.bodyEl && !_visible(E.bodyEl)) { _stop(); return; } // modale chiuso → ferma
        var c = E.chunks[E.idx];
        var txt = (E.subChar > 0 && E.subChar < c.text.length) ? c.text.slice(E.subChar) : c.text;
        var u = new SpeechSynthesisUtterance(txt);
        u.lang = E.lang;
        var v = _pickVoice(E.lang); if (v) u.voice = v;
        u.rate = Math.max(0.5, Math.min(2, _rate() * (c.rateMul || 1)));
        u.pitch = c.pitch || 1.0;
        u.onend = function () {
            if (!E.playing || E.utter !== u) return;
            _clearGap();
            E.gapTimer = setTimeout(function () { E.idx++; E.subChar = 0; _speakCurrent(); }, c.endPause || 180);
        };
        u.onerror = function () { if (E.playing && E.utter === u) { E.idx++; E.subChar = 0; _speakCurrent(); } };
        var from = (E.subChar > 0 && E.subChar < c.text.length) ? E.subChar : 0;
        u.onboundary = function (ev) {
            if (E.utter !== u || (ev.name && ev.name !== 'word')) return;
            E.bnd = true; // la voce dice dove è: la stima sul tempo si spegne
            _word(_spokenIndexAt(c, from + (ev.charIndex || 0)));
        };
        E.utter = u; E.bnd = false;
        E.chunkT0 = _now() - (E.subChar > 0 ? (E.subChar / Math.max(1, c.text.length)) * (E.durations[E.idx] || 0) * 1000 : 0);
        _highlight(E.idx);
        _word(_spokenIndexAt(c, from));
        try { window.speechSynthesis.cancel(); } catch (e) {}
        try { window.speechSynthesis.speak(u); } catch (e) {}
        _paint(true);
    }
    function _finish() {
        _clearGap(); _stopTicker(); _clearHighlight(); _rsvpHide();
        E.playing = false; E.idx = 0; E.subChar = 0;
        _paint(false); _renderProgress(1);
    }
    // WebKit (iPad): un `cancel()` che arriva mentre una frase sta partendo a
    // volte non la ferma, e la voce prosegue a pannello chiuso. Se ne manda un
    // secondo poco dopo — solo se nel frattempo nessuno ha ripreso a leggere.
    function _zitto() {
        try { window.speechSynthesis.cancel(); } catch (e) {}
        setTimeout(function () { if (!E.playing) { try { window.speechSynthesis.cancel(); } catch (e) {} } }, 80);
    }
    function _stop(keepWrap) {
        _clearGap(); _stopTicker(); _clearHighlight(); _rsvpHide();
        _zitto();
        E.playing = false; E.utter = null; E.idx = 0; E.subChar = 0;
        _paint(false); _renderProgress(0);
        if (!keepWrap) E.wrap = null;
    }
    function _playFrom(i, subChar) {
        _clearGap();
        // un lettore alla volta: la lettura veloce, se aperta, si chiude
        try { document.dispatchEvent(new CustomEvent('mappai:lettura', { detail: { chi: 'voce' } })); } catch (e) {}
        E.idx = Math.max(0, Math.min(i, E.chunks.length - 1));
        E.subChar = subChar || 0; E.playing = true;
        _paint(true); _startTicker();
        _speakCurrent();
    }
    function _pause() {
        _clearGap(); _stopTicker();
        _zitto();
        E.playing = false; E.subChar = 0; // alla ripresa rilegge la frase corrente dall'inizio
        _paint(false);
    }

    function _now() { try { return performance.now(); } catch (e) { return Date.now(); } }
    function _globalTime() {
        if (!E.chunks.length) return 0;
        var base = E.starts[E.idx] || 0;
        var el = Math.min(E.durations[E.idx] || 0, Math.max(0, (_now() - E.chunkT0) / 1000));
        return Math.min(E.total, base + el);
    }
    function _idxAtTime(t) {
        for (var i = 0; i < E.chunks.length; i++) { if (t < (E.starts[i] || 0) + (E.durations[i] || 0)) return i; }
        return Math.max(0, E.chunks.length - 1);
    }
    function _seekToTime(t) {
        t = Math.max(0, Math.min(t, Math.max(0, E.total - 0.05)));
        var i = _idxAtTime(t);
        var frac = (E.durations[i] > 0) ? (t - (E.starts[i] || 0)) / E.durations[i] : 0;
        var sub = Math.floor(frac * (E.chunks[i] ? E.chunks[i].text.length : 0));
        _playFrom(i, sub);
    }

    // ── Ticker barra di avanzamento ────────────────────────────────────────
    function _startTicker() {
        _stopTicker();
        E.ticker = setInterval(function () {
            if (!E.dragging) _renderProgress(E.total ? _globalTime() / E.total : 0);
            if (E.playing && !E.bnd) _estimateWord(); // voci senza `boundary`
        }, 100);
    }
    function _stopTicker() { if (E.ticker) { clearInterval(E.ticker); E.ticker = null; } }
    function _fmt(sec) { sec = Math.max(0, Math.round(sec)); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
    function _renderProgress(ratio) {
        if (!E.wrap) return;
        ratio = Math.max(0, Math.min(1, ratio || 0));
        var fill = E.wrap.querySelector('.mai-tts-fill'), thumb = E.wrap.querySelector('.mai-tts-thumb'), time = E.wrap.querySelector('.mai-tts-time');
        if (fill) fill.style.width = (ratio * 100) + '%';
        if (thumb) thumb.style.left = (ratio * 100) + '%';
        if (time) time.textContent = _fmt(ratio * E.total);
    }

    // ── Azioni ──────────────────────────────────────────────────────────────
    function _togglePlay(wrap) {
        if (!supported) { try { window.showToast && window.showToast(_t('tst_no_tts', 'Sintesi vocale non supportata su questo dispositivo'), 'error'); } catch (e) {} return; }
        if (E.wrap === wrap && E.playing) { _pause(); return; }
        if (E.wrap !== wrap) { _stop(); _load(wrap); }
        else if (!E.chunks.length) { _load(wrap); }
        if (E.idx >= E.chunks.length) E.idx = 0;
        _playFrom(E.idx, E.subChar);
    }
    function _seek(wrap, delta) {
        if (!supported) return;
        if (E.wrap !== wrap || !E.chunks.length) { _stop(); _load(wrap); }
        _seekToTime(_globalTime() + delta);
    }
    function _cycleRate(wrap) {
        var i = (_rateIdx() + 1) % SPEEDS.length;
        _setRateIdx(i);
        _mounted.forEach(function (h) { _paintRate(h.wrap); });
        if (E.wrap && E.chunks.length) {
            var t = _globalTime(); _recomputeTiming();
            if (E.playing) _seekToTime(t); else _renderProgress(E.total ? t / E.total : 0);
        }
    }
    function _cycleEffect() {
        var fx = EFFECTS[(EFFECTS.indexOf(_effect()) + 1) % EFFECTS.length];
        try { localStorage.setItem(LS_EFFECT, fx); } catch (e) {}
        _mounted.forEach(function (h) {
            var seg = h.wrap.querySelector('.mai-tts-fx'); if (!seg) return;
            seg.innerHTML = '<i data-lucide="' + FX_ICON[fx] + '"></i>';
            seg.title = _fxLabel(fx); seg.setAttribute('aria-label', _fxLabel(fx));
        });
        _icons();
        if (E.playing && E.chunks.length) { var k = E.wordIdx; _highlight(E.idx); _word(Math.max(0, k)); }
        if (fx !== 'rsvp') _rsvpHide();
        try { window.showToast && window.showToast(_fxLabel(fx), 'info'); } catch (e) {}
    }
    // Avvio dell'ascolto da un titolo/sezione specifica del corpo.
    function playFromNode(bodyEl, node) {
        var wrap = _wrapForBody(bodyEl); if (!wrap || !node) return;
        if (E.wrap !== wrap) { _stop(); _load(wrap); } else if (!E.chunks.length) { _load(wrap); }
        var idx = _chunkIndexForNode(node);
        _playFrom(idx >= 0 ? idx : 0, 0);
    }
    function _chunkIndexForNode(node) {
        for (var i = 0; i < E.chunks.length; i++) { if (E.chunks[i].srcNode === node) return i; }
        for (var j = 0; j < E.chunks.length; j++) {
            try { if (node.compareDocumentPosition(E.chunks[j].srcNode) & Node.DOCUMENT_POSITION_FOLLOWING) return j; } catch (e) {}
        }
        return 0;
    }

    // ── Rendering del controllo ─────────────────────────────────────────────
    function _setIcon(seg, name) { seg.innerHTML = '<i data-lucide="' + name + '"></i>'; }
    function _paint(playing) {
        if (!E.wrap) return;
        var seg = E.wrap.querySelector('.mai-tts-play');
        var chip = E.wrap.querySelector('.mai-tts-chip');
        if (seg) { _setIcon(seg, playing ? 'pause' : 'play'); if (chip) chip.classList.toggle('is-playing', !!playing); _icons(); }
    }
    function _paintRate(wrap) { var seg = wrap.querySelector('.mai-tts-rate'); if (seg) seg.textContent = '×' + SPEEDS[_rateIdx()]; }

    function _makeControl(resolveBody) {
        var wrap = document.createElement('span');
        wrap.className = 'mai-tts-wrap';
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', _t('tts_group', 'Lettura ad alta voce'));
        wrap.innerHTML =
            '<span class="mai-tts-chip">' +
                '<button type="button" class="mai-tts-seg mai-tts-back" title="' + _t('tts_back', 'Indietro 10 secondi') + '" aria-label="' + _t('tts_back', 'Indietro 10 secondi') + '"><i data-lucide="rotate-ccw"></i><span>10</span></button>' +
                '<button type="button" class="mai-tts-seg mai-tts-play" title="' + _t('tts_play', 'Ascolta / Pausa') + '" aria-label="' + _t('tts_play', 'Ascolta / Pausa') + '"><i data-lucide="play"></i></button>' +
                '<button type="button" class="mai-tts-seg mai-tts-fwd" title="' + _t('tts_fwd', 'Avanti 5 secondi') + '" aria-label="' + _t('tts_fwd', 'Avanti 5 secondi') + '"><i data-lucide="rotate-cw"></i><span>5</span></button>' +
                '<button type="button" class="mai-tts-seg mai-tts-rate" title="' + _t('tts_rate', 'Velocità di lettura') + '" aria-label="' + _t('tts_rate', 'Velocità di lettura') + '">×' + SPEEDS[_rateIdx()] + '</button>' +
                '<button type="button" class="mai-tts-seg mai-tts-fx" title="' + _fxLabel(_effect()) + '" aria-label="' + _fxLabel(_effect()) + '"><i data-lucide="' + FX_ICON[_effect()] + '"></i></button>' +
            '</span>' +
            '<span class="mai-tts-progress" role="slider" aria-label="' + _t('tts_progress', 'Avanzamento lettura') + '" tabindex="0"><span class="mai-tts-fill"></span><span class="mai-tts-thumb"></span></span>' +
            '<span class="mai-tts-time">0:00</span>';
        wrap._resolveBody = resolveBody;
        wrap.querySelector('.mai-tts-back').addEventListener('click', function () { _seek(wrap, -BACK_SEC); });
        wrap.querySelector('.mai-tts-play').addEventListener('click', function () { _togglePlay(wrap); });
        wrap.querySelector('.mai-tts-fwd').addEventListener('click', function () { _seek(wrap, FWD_SEC); });
        wrap.querySelector('.mai-tts-rate').addEventListener('click', function () { _cycleRate(wrap); });
        wrap.querySelector('.mai-tts-fx').addEventListener('click', function () { _cycleEffect(); });
        _wireProgress(wrap);
        return wrap;
    }

    function _wireProgress(wrap) {
        var track = wrap.querySelector('.mai-tts-progress');
        function ratioAt(clientX) {
            var box = track.getBoundingClientRect();
            return box.width ? Math.max(0, Math.min(1, (clientX - box.left) / box.width)) : 0;
        }
        function preview(clientX) { _renderProgress(ratioAt(clientX)); }
        function commit(clientX) {
            if (E.wrap !== wrap || !E.chunks.length) { _stop(); _load(wrap); }
            _seekToTime(ratioAt(clientX) * E.total);
        }
        track.addEventListener('pointerdown', function (e) {
            if (E.wrap !== wrap || !E.chunks.length) { _stop(); _load(wrap); }
            E.dragging = true; try { track.setPointerCapture(e.pointerId); } catch (er) {} preview(e.clientX); e.preventDefault();
        });
        track.addEventListener('pointermove', function (e) { if (E.dragging) preview(e.clientX); });
        track.addEventListener('pointerup', function (e) { if (!E.dragging) return; E.dragging = false; try { track.releasePointerCapture(e.pointerId); } catch (er) {} commit(e.clientX); });
        track.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowLeft') { _seek(wrap, -BACK_SEC); e.preventDefault(); }
            else if (e.key === 'ArrowRight') { _seek(wrap, FWD_SEC); e.preventDefault(); }
            else if (e.key === ' ' || e.key === 'Enter') { _togglePlay(wrap); e.preventDefault(); }
        });
    }

    // ── Montaggio ───────────────────────────────────────────────────────────
    var _mounted = []; // { slot, wrap }
    function _resolverForSlot(slot) {
        return function () {
            var sel = slot.getAttribute('data-tts-body');
            if (sel) { var el = document.querySelector(sel); if (el) return el; }
            var modal = slot.closest('.fixed, [id]') || slot.parentElement;
            if (modal) { var body = modal.querySelector('.ai-result-content, .modal-scroll, [id$="-body"], [id$="-content"]'); if (body) return body; }
            return modal;
        };
    }
    function _wrapForBody(bodyEl) {
        for (var i = 0; i < _mounted.length; i++) {
            try { if (_mounted[i].wrap.isConnected && _mounted[i].wrap._resolveBody() === bodyEl) return _mounted[i].wrap; } catch (e) {}
        }
        return null;
    }
    function mountSlot(slot) {
        if (!slot || slot._maiMounted) return;
        if (slot.hasAttribute('data-tts-fila')) { slot._maiMounted = true; _filaScheda(slot); return; }
        var wrap = _makeControl(_resolverForSlot(slot));
        slot.appendChild(wrap);
        slot._maiMounted = true;
        _mounted.push({ slot: slot, wrap: wrap });
        wrap.style.display = isEnabled() ? '' : 'none';
        if (slot.hasAttribute('data-tts-sections')) { try { enableSectionPlay(slot.getAttribute('data-tts-body')); } catch (e) {} }
        _icons();
    }
    function mountChip(container, getTextEl) {
        if (!container) return null;
        var wrap = _makeControl(typeof getTextEl === 'function' ? getTextEl : function () { return getTextEl; });
        container.appendChild(wrap);
        _mounted.push({ slot: container, wrap: wrap });
        wrap.style.display = isEnabled() ? '' : 'none';
        _icons();
        return wrap;
    }
    function scanSlots(root) { (root || document).querySelectorAll('.mai-tts-slot').forEach(mountSlot); }

    // ── La FILA di lettura (17/9/26) ────────────────────────────────────────
    // Gli stessi comandi, nello stesso ordine e con la stessa veste, dovunque si
    // legge o si ascolta — scheda del nodo, pannello flottante, sintesi:
    //   chip della voce (⟲10 · ▶ · 5⟳ · velocità · effetto) e avanzamento
    //   · Aa ×1/×1.5/×2 · Riga · Lettura veloce · altro (es. Stampa)
    // Che cosa fanno Aa e Riga lo dice la superficie; ciò che non passa non c'è.
    //   opts.corpo  fn → l'elemento da leggere
    //   opts.aa     { leggi: fn → '×1', premi: fn }
    //   opts.riga   { leggi: fn → { t: 'no', on: false }, premi: fn }
    //   opts.veloce fn
    //   opts.altro  [{ etichetta, icona, azione }]
    function fila(host, opts) {
        opts = opts || {};
        var row = document.createElement('div');
        row.className = 'mai-fila';
        host.appendChild(row);
        if (opts.sganciabile) {
            // la maniglia: trascinata sgancia la fila e la porta dove si vuole;
            // toccata e basta la sgancia in basso al centro (e da tastiera)
            var grip = document.createElement('button');
            grip.type = 'button'; grip.className = 'mai-fila-bt mai-fila-grip';
            grip.title = _t('tts_sposta', 'Sposta i comandi'); grip.setAttribute('aria-label', grip.title);
            grip.innerHTML = '<i data-lucide="grip-vertical"></i>';
            row.appendChild(grip);
            var mosso = false, eraLibera = false;
            _trascina(grip, row, function () { mosso = false; eraLibera = !!row._libera; _sgancia(row); }, function () { mosso = true; }, function () {
                if (!mosso && !eraLibera) _posiziona(row, (innerWidth - row.offsetWidth) / 2, innerHeight - row.offsetHeight - 24);
            });
        }
        var wrap = mountChip(row, opts.corpo);
        if (wrap) wrap.style.display = ''; // qui è IL lettore: il cancello degli strumenti compensativi non vale
        row._wrap = wrap;
        function bt(etichetta, icona, azione) {
            var b = document.createElement('button');
            b.type = 'button'; b.className = 'mai-fila-bt';
            b.title = etichetta; b.setAttribute('aria-label', etichetta);
            b.innerHTML = '<i data-lucide="' + icona + '"></i>';
            b.addEventListener('click', azione);
            row.appendChild(b);
            return b;
        }
        // un bottone con stato: l'etichetta si rilegge DOPO il tocco (chi lo
        // governa può aggiornarsi a timeout 0)
        function conStato(etichetta, icona, conf, disegna) {
            var b = bt(etichetta, icona, function () { conf.premi(); setTimeout(function () { disegna(b); }, 0); });
            b.appendChild(document.createElement('span'));
            disegna(b);
        }
        if (opts.aa) conStato(_t('tts_scale', 'Grandezza del testo'), 'a-large-small', opts.aa, function (b) {
            b.querySelector('span').textContent = opts.aa.leggi();
        });
        if (opts.riga) conStato(_t('tts_riga', 'Riga di lettura'), 'align-justify', opts.riga, function (b) {
            var st = opts.riga.leggi() || {};
            b.querySelector('span').textContent = st.t || '';
            b.setAttribute('aria-pressed', st.on ? 'true' : 'false');
        });
        if (opts.veloce) bt(_t('rsvp_titolo', 'Lettura veloce'), 'gauge', opts.veloce);
        (opts.altro || []).forEach(function (a) { bt(a.etichetta, a.icona, a.azione); });
        if (opts.sganciabile) bt(_t('tts_rimetti', 'Rimetti i comandi al loro posto'), 'pin', function () { _rimetti(row); })
            .classList.add('mai-fila-rimetti');
        _icons();
        return row;
    }

    // ── Spostare i comandi (17/9/26) ────────────────────────────────────────
    // Il pannello flottante si trascina dalla testata e ricorda dove è stato
    // lasciato (doppio tocco sulla testata: torna in basso al centro). La fila
    // della scheda e della sintesi si SGANCIA dalla sua maniglia e diventa una
    // barra libera; 📌 la rimette al suo posto, e al posto torna comunque quando
    // la scheda si chiude (invalidate).
    var LS_POS = 'mappai_lettura_pos';
    var _libere = [];
    function _posiziona(el, x, y) {
        var w = el.offsetWidth, h = el.offsetHeight;
        x = Math.max(8, Math.min(x, innerWidth - w - 8));
        y = Math.max(8, Math.min(y, innerHeight - h - 8));
        el.style.left = x + 'px'; el.style.top = y + 'px';
        el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none';
        return { x: x, y: y };
    }
    // onStart all'appoggio, onMove al primo spostamento, onEnd al rilascio
    function _trascina(handle, el, onStart, onMove, onEnd) {
        var d = null;
        handle.addEventListener('pointerdown', function (e) {
            if (e.button > 0) return;
            var b = e.target.closest ? e.target.closest('button') : null;
            if (b && b !== handle) return; // la × e gli altri bottoni restano bottoni
            if (onStart) onStart();
            var r = el.getBoundingClientRect();
            d = { dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, mosso: false };
            try { handle.setPointerCapture(e.pointerId); } catch (er) {}
            e.preventDefault();
        });
        handle.addEventListener('pointermove', function (e) {
            if (!d) return;
            if (!d.mosso && Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) < 6) return;
            if (!d.mosso) { d.mosso = true; if (onMove) onMove(); }
            _posiziona(el, e.clientX - d.dx, e.clientY - d.dy);
        });
        function fine(e) {
            if (!d) return;
            d = null;
            try { handle.releasePointerCapture(e.pointerId); } catch (er) {}
            if (onEnd) onEnd();
        }
        handle.addEventListener('pointerup', fine);
        handle.addEventListener('pointercancel', fine);
    }
    function _sgancia(row) {
        if (row._libera) return;
        var r = row.getBoundingClientRect();
        var posto = document.createElement('span');
        posto.className = 'mai-fila-posto'; posto.hidden = true;
        row.parentNode.insertBefore(posto, row);
        row._posto = posto; row._libera = true;
        row.classList.add('mai-fila--libera');
        document.body.appendChild(row);
        _posiziona(row, r.left, r.top);
        _libere.push(row);
        _icons();
    }
    function _rimetti(row) {
        if (!row._libera) return;
        row._libera = false;
        row.classList.remove('mai-fila--libera');
        row.style.left = row.style.top = row.style.right = row.style.bottom = row.style.transform = '';
        if (row._posto && row._posto.isConnected) { row._posto.parentNode.insertBefore(row, row._posto); row._posto.remove(); }
        else row.remove(); // la superficie non c'è più: la fila va via con lei
        row._posto = null;
        _libere = _libere.filter(function (x) { return x !== row; });
    }
    // Pannello flottante trascinabile dalla sua testata, con memoria.
    function trascinabile(panel, handle) {
        try {
            var pos = JSON.parse(localStorage.getItem(LS_POS) || 'null');
            if (pos && typeof pos.x === 'number') _posiziona(panel, pos.x, pos.y);
        } catch (e) {}
        handle.classList.add('mai-maniglia');
        _trascina(handle, panel, null, null, function () {
            if (!panel.style.left) return;
            try { localStorage.setItem(LS_POS, JSON.stringify({ x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) })); } catch (e) {}
        });
        handle.addEventListener('dblclick', function () {
            try { localStorage.removeItem(LS_POS); } catch (e) {}
            panel.style.left = panel.style.top = panel.style.right = panel.style.bottom = panel.style.transform = '';
        });
    }
    // La fila della scheda del nodo: Aa è lo zoom del testo dell'app, Riga la
    // riga di lettura dell'app, la lettura veloce prende il posto del corpo.
    function _filaScheda(slot) {
        fila(slot, {
            sganciabile: true,
            corpo: _resolverForSlot(slot),
            aa: {
                leggi: function () {
                    var i = 0; try { i = parseInt(localStorage.getItem('mappai-a11y-zoom') || '0', 10) || 0; } catch (e) {}
                    return '×' + ([1, 1.5, 2][i] || 1);
                },
                premi: function () { if (window.cycleTextZoom) window.cycleTextZoom(); }
            },
            riga: {
                leggi: function () {
                    var r = document.getElementById('reading-ruler'), on = !!(r && r.classList.contains('active'));
                    return { t: on ? _t('tts_si', 'sì') : _t('tts_no', 'no'), on: on };
                },
                // accesa da qui → si spegne quando la scheda si chiude (closeSourceModal);
                // accesa dal pannello degli strumenti resta: è una scelta per tutta l'app
                premi: function () {
                    var r = document.getElementById('reading-ruler'); if (!r) return;
                    r.classList.toggle('active');
                    r.setAttribute('data-da-scheda', r.classList.contains('active') ? '1' : '');
                }
            },
            veloce: function () { if (window.MappAILetturaVeloce) window.MappAILetturaVeloce.daScheda(); }
        });
    }

    // Pulsante ▶ "ascolta da qui" davanti a ogni titolo del corpo.
    function enableSectionPlay(bodyOrSel) {
        var body = (typeof bodyOrSel === 'string') ? document.querySelector(bodyOrSel) : bodyOrSel;
        if (!body) return;
        body.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(function (h) {
            if (h.querySelector('.mai-tts-sec')) return;
            var b = document.createElement('button');
            b.type = 'button'; b.className = 'mai-tts-sec' + (isEnabled() ? ' on' : '');
            b.setAttribute('data-tts-skip', '');
            b.title = _t('tts_play_section', 'Ascolta da qui'); b.setAttribute('aria-label', _t('tts_play_section', 'Ascolta da qui'));
            b.innerHTML = '<i data-lucide="play"></i>';
            b.addEventListener('click', function (e) { e.stopPropagation(); playFromNode(body, h); });
            h.insertBefore(b, h.firstChild);
        });
        _icons();
    }

    function setEnabled(on) {
        try { localStorage.setItem(LS_ENABLED, on ? '1' : '0'); } catch (e) {}
        if (!on) _stop();
        _mounted = _mounted.filter(function (h) { return h.wrap.isConnected; });
        _mounted.forEach(function (h) { if (!h.wrap._floating) h.wrap.style.display = on ? '' : 'none'; });
        document.querySelectorAll('.mai-tts-sec').forEach(function (b) { b.classList.toggle('on', on); });
    }

    // ── Card audio flottante (TTS avviato dal menu contestuale di un nodo) ──
    // Mostra titolo + testo del nodo con karaoke, chip a 4 segmenti e barra di
    // avanzamento, così l'allievo si orienta nell'ascolto. Sempre visibile
    // (avvio esplicito dall'utente), a prescindere dal toggle compensativo.
    function _closeFloat() {
        var f = document.getElementById('mai-tts-float');
        if (E.wrap && E.wrap._floating) _stop();
        if (f) f.remove();
        _mounted = _mounted.filter(function (h) { return h.wrap.isConnected; });
    }
    function isFloatingOpen() { return !!document.getElementById('mai-tts-float'); }
    function _applyScale(f) {
        var sc = _scale();
        f.classList.toggle('mai-tts-float--x15', sc === 1.5);
        f.classList.toggle('mai-tts-float--x2', sc === 2);
    }
    function _cycleScale(f) {
        var sc = SCALES[(SCALES.indexOf(_scale()) + 1) % SCALES.length];
        try { localStorage.setItem(LS_SCALE, String(sc)); } catch (e) {}
        _applyScale(f);
        if (f.style.left) _posiziona(f, parseFloat(f.style.left), parseFloat(f.style.top));
        // cambiata la misura, la parola corrente torna in vista
        var k = E.wordIdx; if (k >= 0) { E.wordIdx = -1; _word(k); }
    }
    function playFloating(opts) {
        opts = opts || {};
        _closeFloat();
        var f = document.createElement('div');
        f.id = 'mai-tts-float'; f.className = 'mai-tts-float';
        f.setAttribute('lang', (opts.lang === 'en-US' || opts.lang === 'en') ? 'en' : 'it');
        var close = document.createElement('button');
        close.type = 'button'; close.className = 'mai-tts-float-close';
        close.setAttribute('aria-label', _t('tts_close', 'Chiudi')); close.textContent = '✕';
        close.addEventListener('click', _closeFloat);
        var titleBar = document.createElement('div'); titleBar.className = 'mai-tts-float-t';
        titleBar.textContent = opts.title || '';
        var bodyEl = document.createElement('div'); bodyEl.className = 'mai-tts-float-body';
        if (opts.title) { var h = document.createElement('h4'); h.textContent = opts.title; bodyEl.appendChild(h); }
        var p = document.createElement('p'); p.textContent = opts.text || ''; bodyEl.appendChild(p);
        var ctrl = document.createElement('div'); ctrl.className = 'mai-tts-float-ctrl';
        f.appendChild(close); f.appendChild(titleBar); f.appendChild(bodyEl); f.appendChild(ctrl);
        _applyScale(f);
        document.body.appendChild(f);
        var wrap = fila(ctrl, {
            corpo: function () { return bodyEl; },
            aa: { leggi: function () { return '×' + _scale(); }, premi: function () { _cycleScale(f); } },
            veloce: function () {
                if (window.MappAILetturaVeloce) window.MappAILetturaVeloce.apri({ titolo: opts.title || '', testo: opts.text || '' });
            }
        })._wrap;
        wrap._floating = true;
        trascinabile(f, titleBar); // dopo la fila: la posizione ricordata si misura sul pannello intero
        _stop(); _load(wrap); _playFrom(0, 0); // avvio automatico
        return f;
    }
    function toggle(btn) {
        var on = !isEnabled();
        setEnabled(on);
        if (btn && btn.classList) btn.classList.toggle('active', on);
        try {
            window.showToast && window.showToast(
                on ? _t('tts_on', 'Ascolto testo attivo — troverai il comando nei materiali di studio') : _t('tts_off', 'Ascolto testo disattivato'),
                on ? 'success' : 'info');
        } catch (e) {}
    }

    // ── CSS (auto-iniettato) ────────────────────────────────────────────────
    function _injectCss(doc) {
        doc = doc || document;
        if (!doc.head || doc.getElementById('mai-tts-style')) return;
        var css =
            '.mai-tts-slot{display:inline-flex;align-items:center;flex:1 1 auto;min-width:0;vertical-align:middle}' +
            '.mai-tts-wrap{display:inline-flex;align-items:center;gap:10px;max-width:100%;flex:1 1 auto;min-width:0;vertical-align:middle;font-family:"Space Mono",monospace}' +
            '.mai-tts-chip{display:inline-flex;align-items:stretch;height:40px;border-radius:9999px;background:#fff;border:1px solid #e2e8f0;box-shadow:0 4px 6px -1px rgba(15,23,42,.12);overflow:hidden;flex:0 0 auto}' +
            '.mai-tts-seg{display:inline-flex;align-items:center;justify-content:center;gap:2px;min-width:46px;padding:0 12px;border:0;background:transparent;color:#4f46e5;cursor:pointer;font-family:inherit;font-weight:700;font-size:12px;transition:background .15s,color .15s;border-left:1px solid #eef2ff}' +
            '.mai-tts-seg:first-child{border-left:0}.mai-tts-seg:hover{background:#eef2ff}.mai-tts-seg:active{background:#e0e7ff}' +
            '.mai-tts-seg i{width:16px;height:16px}.mai-tts-seg span{font-size:10px;line-height:1;font-weight:700}' +
            '.mai-tts-play{min-width:52px;color:#4338ca}.mai-tts-chip.is-playing .mai-tts-play{background:#4f46e5;color:#fff}' +
            '.mai-tts-rate{min-width:54px;letter-spacing:.02em}' +
            '.mai-tts-progress{position:relative;flex:1 1 160px;min-width:120px;height:8px;border-radius:9999px;background:#e2e8f0;cursor:pointer;touch-action:none}' +
            '.mai-tts-progress:focus-visible{outline:2px solid #6366f1;outline-offset:3px}' +
            '.mai-tts-fill{position:absolute;left:0;top:0;height:100%;width:0;border-radius:9999px;background:#4f46e5;pointer-events:none}' +
            '.mai-tts-thumb{position:absolute;top:50%;left:0;width:14px;height:14px;border-radius:50%;background:#4f46e5;transform:translate(-50%,-50%);box-shadow:0 1px 4px rgba(15,23,42,.35);pointer-events:none}' +
            '.mai-tts-time{font-size:11px;font-weight:700;color:#64748b;min-width:34px;text-align:right;flex:0 0 auto}' +
            '.mai-tts-sec{display:none;align-items:center;justify-content:center;width:22px;height:22px;margin-right:8px;padding:0;border:0;border-radius:9999px;background:#eef2ff;color:#4f46e5;cursor:pointer;vertical-align:middle}' +
            '.mai-tts-sec.on{display:inline-flex}.mai-tts-sec:hover{background:#e0e7ff}.mai-tts-sec i{width:13px;height:13px}' +
            '.mai-tts-block{background:rgba(253,230,138,.30);border-radius:5px;box-shadow:0 0 0 3px rgba(253,230,138,.30)}' +
            '::highlight(mai-tts-read){background-color:#fde68a;color:#0f172a}' +
            '.mai-tts-float{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:4000;width:min(560px,92vw);background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 18px 44px rgba(15,23,42,.30);padding:16px 18px 14px;font-family:"Space Mono",monospace}' +
            '.mai-tts-float-close{position:absolute;top:9px;right:12px;border:0;background:transparent;color:#94a3b8;cursor:pointer;font-size:15px;line-height:1;width:22px;height:22px;border-radius:9999px}' +
            '.mai-tts-float-close:hover{background:#f1f5f9;color:#475569}' +
            '.mai-tts-float-body{max-height:32vh;overflow:auto;margin:0 0 12px;padding-right:6px}' +
            '.mai-tts-float-body h4{font-size:14px;font-weight:800;color:#4338ca;margin:0 0 6px}' +
            '.mai-tts-float-body p{font-size:13px;line-height:1.75;color:#334155;margin:0}' +
            '.mai-tts-float-ctrl{display:flex}' +
            // effetti parola per parola
            '::highlight(mai-tts-word-u){text-decoration:underline;text-decoration-color:#4f46e5;text-decoration-thickness:3px;text-underline-offset:5px;background-color:rgba(199,210,254,.55)}' +
            '.mai-tts-fx-parola,.mai-tts-fx-parola *{color:rgba(100,116,139,.35) !important}' +
            '::highlight(mai-tts-word-lit){color:#0f172a;background-color:rgba(253,230,138,.6)}' +
            // una parola alla volta: la lettera di fuoco ferma al centro, fra due tacche
            '.mai-rsvp{position:relative;display:flex;align-items:center;justify-content:center;flex:0 0 auto;min-height:1.9em;padding:.35em 0;margin:0 0 10px;border-radius:12px;background:#f8fafc;color:#0f172a;font-size:34px;font-weight:700;line-height:1.1;font-family:var(--app-font,"Space Mono",monospace);overflow:hidden}' +
            '.mai-rsvp::before,.mai-rsvp::after{content:"";position:absolute;left:50%;width:2px;height:.3em;background:#ef4444;transform:translateX(-50%)}' +
            '.mai-rsvp::before{top:4px}.mai-rsvp::after{bottom:4px}' +
            '.mai-rsvp__w{display:grid;grid-template-columns:1fr auto 1fr;width:100%;white-space:pre}' +
            '.mai-rsvp__b{text-align:right}.mai-rsvp__o{color:#ef4444}.mai-rsvp__a{text-align:left}' +
            '.mai-tts-rsvp{margin:10px 20px 0}' +
            '.mai-tts-float .mai-tts-rsvp{margin:0 0 10px}' +
            // grandezza del pannello flottante
            // la fila di lettura: stessi pezzi, stessa veste, ovunque
            '.mai-fila{display:flex;flex-wrap:wrap;align-items:center;gap:8px;flex:1 1 auto;min-width:0}' +
            // il chip non si schiaccia sotto la sua misura: la fila va a capo
            '.mai-fila .mai-tts-wrap{flex:1 1 390px;min-width:min(100%,390px)}' +
            '.mai-fila .mai-tts-progress{min-width:80px}' +
            '.mai-fila-bt{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:44px;height:40px;padding:0 11px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#4338ca;cursor:pointer;white-space:nowrap;font:700 12px "Space Mono",monospace}' +
            '.mai-fila-bt svg,.mai-fila-bt i{width:18px;height:18px;flex:0 0 auto}' +
            '.mai-fila-bt span:empty{display:none}' +
            '.mai-fila-bt[aria-pressed="true"]{background:#eef2ff;border-color:#c7d2fe}' +
            // la testata è una riga sua in tutte le grandezze: titolo a sinistra,
            // Aa e × a destra — la striscia RSVP ci finiva sopra (17/9)
            '.mai-tts-float:not(.mai-lv){padding-top:44px}' +
            '.mai-tts-float-body h4{display:none}' +
            // la testata è anche la maniglia: alta 44, tutta da afferrare
            '.mai-tts-float-t{position:absolute;top:0;left:0;right:44px;height:44px;line-height:44px;margin:0;padding-left:18px;font-size:13px;font-weight:800;color:#4338ca;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
            '.mai-maniglia{cursor:move;touch-action:none;user-select:none;-webkit-user-select:none}' +
            '.mai-maniglia::before{content:"⠿";margin-right:8px;color:#94a3b8;font-weight:400}' +
            '.mai-fila-grip{min-width:30px;padding:0 3px;border-color:transparent;background:transparent;color:#94a3b8;cursor:grab;touch-action:none}' +
            '.mai-fila-rimetti{display:none}' +
            '.mai-fila--libera{position:fixed;z-index:4100;width:max-content;max-width:calc(100vw - 24px);padding:8px 10px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 18px 44px rgba(15,23,42,.28)}' +
            '.mai-fila--libera .mai-fila-rimetti{display:inline-flex}' +
            '.mai-fila--libera .mai-fila-grip{cursor:grabbing}' +
            '.mai-tts-float--x15{width:min(880px,96vw)}' +
            '.mai-tts-float--x15 .mai-tts-float-body{max-height:calc(3 * 22px * 1.6);overflow:hidden;margin-right:0}' +
            '.mai-tts-float--x15 .mai-tts-float-body p{font-size:22px;line-height:1.6}' +
            '.mai-tts-float--x15 .mai-rsvp{font-size:48px}' +
            '.mai-tts-float--x2{width:calc(100vw - 24px);bottom:12px}' +
            '.mai-tts-float--x2 .mai-tts-float-body{max-height:calc(36px * 1.4);overflow:hidden;margin-right:0}' +
            '.mai-tts-float--x2 .mai-tts-float-body p{font-size:36px;line-height:1.4}' +
            '.mai-tts-float--x2 .mai-rsvp{font-size:64px}';
        var dark =
            '@media (prefers-color-scheme: dark){' +
            '.mai-tts-fx-parola,.mai-tts-fx-parola *{color:rgba(148,163,184,.35) !important}::highlight(mai-tts-word-lit){color:#fff;background-color:rgba(202,138,4,.55)}' +
            '::highlight(mai-tts-word-u){text-decoration-color:#a5b4fc;background-color:rgba(67,56,202,.45)}' +
            '.mai-rsvp{background:#0f172a;color:#f1f5f9}.mai-fila-bt{background:#1e293b;border-color:#334155;color:#a5b4fc}.mai-fila-grip{background:transparent;border-color:transparent;color:#64748b}.mai-fila--libera{background:#0f172a;border-color:#334155}.mai-fila-bt[aria-pressed="true"]{background:#312e81;border-color:#4338ca}.mai-tts-float-t{color:#c7d2fe}' +
            '.mai-tts-chip{background:#1e293b;border-color:#334155}.mai-tts-seg{color:#a5b4fc;border-left-color:#334155}.mai-tts-seg:hover{background:#334155}' +
            '.mai-tts-progress{background:#334155}.mai-tts-time{color:#94a3b8}.mai-tts-sec{background:#312e81;color:#c7d2fe}' +
            '.mai-tts-block{background:rgba(202,138,4,.30);box-shadow:0 0 0 3px rgba(202,138,4,.30)}::highlight(mai-tts-read){background-color:#ca8a04;color:#fff}' +
            '.mai-tts-float{background:#1e293b;border-color:#334155}.mai-tts-float-body h4{color:#c7d2fe}.mai-tts-float-body p{color:#cbd5e1}.mai-tts-float-close:hover{background:#334155;color:#e2e8f0}}';
        var st = doc.createElement('style'); st.id = 'mai-tts-style';
        st.textContent = doc === document ? css + dark : css;
        doc.head.appendChild(st);
    }

    // ── Init ────────────────────────────────────────────────────────────────
    function _init() {
        _injectCss(document);
        E.hl = _hlOf(document);
        scanSlots(document);
        try { var b = document.getElementById('btn-tts-tool'); if (b) b.classList.toggle('active', isEnabled()); } catch (e) {}
        try {
            var mo = new MutationObserver(function (muts) {
                muts.forEach(function (m) {
                    for (var i = 0; i < m.addedNodes.length; i++) {
                        var n = m.addedNodes[i];
                        if (n.nodeType !== 1) continue;
                        if (n.classList && n.classList.contains('mai-tts-slot')) mountSlot(n);
                        else if (n.querySelectorAll) scanSlots(n);
                    }
                });
            });
            mo.observe(document.body, { childList: true, subtree: true });
        } catch (e) {}
        try { document.addEventListener('visibilitychange', function () { if (document.hidden) _pause(); }); } catch (e) {}
        // un lettore alla volta: parte la lettura veloce, la voce tace
        try { document.addEventListener('mappai:lettura', function (e) { if (e.detail && e.detail.chi !== 'voce') { _stop(); _closeFloat(); } }); } catch (e) {}
    }

    /**
     * Butta via i chunk: il testo sotto è cambiato.
     *
     * Serve perché i chunk portano dei Range sui NODI DI TESTO di prima: dopo
     * una modifica quei riferimenti non valgono più (l'evidenziazione finirebbe
     * altrove, o su niente). Ferma anche la lettura in corso — chi sta
     * riscrivendo una frase non vuole sentirsela leggere nella vecchia
     * versione. Al play successivo `_load` ricostruisce tutto dal DOM di adesso:
     * è questo che rende la voce di sistema sempre allineata al testo, senza
     * nulla da rigenerare.
     */
    function invalidate() {
        _stop();
        _libere.slice().forEach(_rimetti);
        E.chunks = []; E.durations = []; E.starts = []; E.total = 0;
        // i controlli smontati (l'editor ri-disegna il foglio) escono dall'elenco
        _mounted = _mounted.filter(function (m) {
            try { return m && m.wrap && m.wrap.isConnected; } catch (e) { return false; }
        });
    }

    window.MappAITTS = {
        isEnabled: isEnabled, setEnabled: setEnabled, toggle: toggle, invalidate: invalidate,
        mountChip: mountChip, mountSlot: mountSlot, scanSlots: scanSlots,
        enableSectionPlay: enableSectionPlay, playFromNode: playFromNode,
        playFloating: playFloating, fila: fila, trascinabile: trascinabile, effect: _effect, closeFloating: _closeFloat, isFloatingOpen: isFloatingOpen,
        stop: function () { _stop(); }, _speeds: SPEEDS
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
    else _init();
})();
