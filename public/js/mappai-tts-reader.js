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

    function _t(k, f) { try { return (window.t ? window.t(k, f) : f) || f; } catch (e) { return f; } }
    function _icons() { try { if (window.safeCreateIcons) window.safeCreateIcons(); } catch (e) {} }

    function isEnabled() { try { return localStorage.getItem(LS_ENABLED) === '1'; } catch (e) { return false; } }
    function _rateIdx() {
        try { var n = parseInt(localStorage.getItem(LS_RATE_IDX), 10); return (n >= 0 && n < SPEEDS.length) ? n : 1; }
        catch (e) { return 1; }
    }
    function _setRateIdx(i) { try { localStorage.setItem(LS_RATE_IDX, String(i)); } catch (e) {} }
    function _rate() { return SPEEDS[_rateIdx()]; }

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
    var _hl = null, _hlSupported = false;
    try {
        if (window.CSS && CSS.highlights && typeof Highlight !== 'undefined') {
            _hl = new Highlight(); CSS.highlights.set('mai-tts-read', _hl); _hlSupported = true;
        }
    } catch (e) { _hlSupported = false; }

    // ── Pulizia testo ──────────────────────────────────────────────────────
    function _cleanLine(s) {
        return String(s || '')
            .replace(/\[\d+\]/g, ' ')
            .replace(/[*_`#]+/g, ' ')
            .replace(/ /g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/\s+([.,;:!?…»)\]])/g, '$1')
            .trim();
    }

    // Testo + mappa dei nodi testuali di un blocco, saltando note/citazioni/controlli.
    function _blockPieces(block) {
        var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                var p = n.parentNode;
                while (p && p !== block) {
                    if (p.nodeType === 1) {
                        var tag = p.tagName.toLowerCase();
                        if (tag === 'sup' || tag === 'button' || tag === 'style' || tag === 'script') return NodeFilter.FILTER_REJECT;
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
    // Divide un testo in intervalli-frase [start,end) preservando la punteggiatura.
    function _sentenceRanges(text) {
        var re = /[.!?…]+[)\]"'”’»]*\s*/g, res = [], last = 0, m;
        while ((m = re.exec(text))) { var end = m.index + m[0].length; res.push({ start: last, end: end }); last = end; }
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
            if (block.closest && block.closest('.bs-citations')) continue;
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
                    r: (a && b) ? { sN: a.node, sO: a.offset, eN: b.node, eO: b.offset } : null
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
        gapTimer: null, utter: null, ticker: null, blockEl: null, dragging: false
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
        try { if (_hl) _hl.clear(); } catch (e) {}
        if (E.blockEl) { try { E.blockEl.classList.remove('mai-tts-block'); } catch (e) {} E.blockEl = null; }
    }
    function _highlight(i) {
        _clearHighlight();
        var ch = E.chunks[i]; if (!ch) return;
        if (ch.srcNode && ch.srcNode.classList) { ch.srcNode.classList.add('mai-tts-block'); E.blockEl = ch.srcNode; }
        if (_hlSupported && ch.r) {
            try { var r = document.createRange(); r.setStart(ch.r.sN, ch.r.sO); r.setEnd(ch.r.eN, ch.r.eO); _hl.add(r); } catch (e) {}
        }
        try { if (ch.srcNode && ch.srcNode.scrollIntoView) ch.srcNode.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
    }

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
        E.utter = u;
        E.chunkT0 = _now() - (E.subChar > 0 ? (E.subChar / Math.max(1, c.text.length)) * (E.durations[E.idx] || 0) * 1000 : 0);
        _highlight(E.idx);
        try { window.speechSynthesis.cancel(); } catch (e) {}
        try { window.speechSynthesis.speak(u); } catch (e) {}
        _paint(true);
    }
    function _finish() {
        _clearGap(); _stopTicker(); _clearHighlight();
        E.playing = false; E.idx = 0; E.subChar = 0;
        _paint(false); _renderProgress(1);
    }
    function _stop(keepWrap) {
        _clearGap(); _stopTicker(); _clearHighlight();
        try { window.speechSynthesis.cancel(); } catch (e) {}
        E.playing = false; E.utter = null; E.idx = 0; E.subChar = 0;
        _paint(false); _renderProgress(0);
        if (!keepWrap) E.wrap = null;
    }
    function _playFrom(i, subChar) {
        _clearGap();
        E.idx = Math.max(0, Math.min(i, E.chunks.length - 1));
        E.subChar = subChar || 0; E.playing = true;
        _paint(true); _startTicker();
        _speakCurrent();
    }
    function _pause() {
        _clearGap(); _stopTicker();
        try { window.speechSynthesis.cancel(); } catch (e) {}
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
    function _startTicker() { _stopTicker(); E.ticker = setInterval(function () { if (!E.dragging) _renderProgress(E.total ? _globalTime() / E.total : 0); }, 100); }
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
            '</span>' +
            '<span class="mai-tts-progress" role="slider" aria-label="' + _t('tts_progress', 'Avanzamento lettura') + '" tabindex="0"><span class="mai-tts-fill"></span><span class="mai-tts-thumb"></span></span>' +
            '<span class="mai-tts-time">0:00</span>';
        wrap._resolveBody = resolveBody;
        wrap.querySelector('.mai-tts-back').addEventListener('click', function () { _seek(wrap, -BACK_SEC); });
        wrap.querySelector('.mai-tts-play').addEventListener('click', function () { _togglePlay(wrap); });
        wrap.querySelector('.mai-tts-fwd').addEventListener('click', function () { _seek(wrap, FWD_SEC); });
        wrap.querySelector('.mai-tts-rate').addEventListener('click', function () { _cycleRate(wrap); });
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
        var bodyEl = document.createElement('div'); bodyEl.className = 'mai-tts-float-body';
        if (opts.title) { var h = document.createElement('h4'); h.textContent = opts.title; bodyEl.appendChild(h); }
        var p = document.createElement('p'); p.textContent = opts.text || ''; bodyEl.appendChild(p);
        var ctrl = document.createElement('div'); ctrl.className = 'mai-tts-float-ctrl';
        f.appendChild(close); f.appendChild(bodyEl); f.appendChild(ctrl);
        document.body.appendChild(f);
        var wrap = _makeControl(function () { return bodyEl; });
        wrap._floating = true;
        ctrl.appendChild(wrap);
        _mounted.push({ slot: ctrl, wrap: wrap });
        _icons();
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
    function _injectCss() {
        if (document.getElementById('mai-tts-style')) return;
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
            '.mai-tts-float-body{max-height:32vh;overflow:auto;margin:2px 22px 12px 0;padding-right:6px}' +
            '.mai-tts-float-body h4{font-size:14px;font-weight:800;color:#4338ca;margin:0 0 6px}' +
            '.mai-tts-float-body p{font-size:13px;line-height:1.75;color:#334155;margin:0}' +
            '.mai-tts-float-ctrl{display:flex}' +
            '@media (prefers-color-scheme: dark){' +
            '.mai-tts-chip{background:#1e293b;border-color:#334155}.mai-tts-seg{color:#a5b4fc;border-left-color:#334155}.mai-tts-seg:hover{background:#334155}' +
            '.mai-tts-progress{background:#334155}.mai-tts-time{color:#94a3b8}.mai-tts-sec{background:#312e81;color:#c7d2fe}' +
            '.mai-tts-block{background:rgba(202,138,4,.30);box-shadow:0 0 0 3px rgba(202,138,4,.30)}::highlight(mai-tts-read){background-color:#ca8a04;color:#fff}' +
            '.mai-tts-float{background:#1e293b;border-color:#334155}.mai-tts-float-body h4{color:#c7d2fe}.mai-tts-float-body p{color:#cbd5e1}.mai-tts-float-close:hover{background:#334155;color:#e2e8f0}}';
        var st = document.createElement('style'); st.id = 'mai-tts-style'; st.textContent = css; document.head.appendChild(st);
    }

    // ── Init ────────────────────────────────────────────────────────────────
    function _init() {
        _injectCss();
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
    }

    window.MappAITTS = {
        isEnabled: isEnabled, setEnabled: setEnabled, toggle: toggle,
        mountChip: mountChip, mountSlot: mountSlot, scanSlots: scanSlots,
        enableSectionPlay: enableSectionPlay, playFromNode: playFromNode,
        playFloating: playFloating, closeFloating: _closeFloat, isFloatingOpen: isFloatingOpen,
        stop: function () { _stop(); }, _speeds: SPEEDS
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
    else _init();
})();
