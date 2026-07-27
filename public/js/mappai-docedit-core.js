/*
 * mappai-docedit-core.js — modello dei DOCUMENTI EDITABILI (quiz, flashcard, sintesi)
 * -------------------------------------------------------------------------------
 * Core PURO (zero DOM, zero AI) dietro l'hub di elaborazione documenti di ELABORA.
 *
 * Principio non negoziabile: si edita la SORGENTE (items del set di studio, blocchi
 * della sintesi), mai l'HTML già stampato. I builder di stampa restano l'unica resa
 * → schermo, stampa, PDF, QR e vault non possono divergere.
 *
 * Contiene:
 *  - normalizzazione item quiz/flashcard (le forme storiche q/correct e front/back
 *    convivono nello stesso archivio: qui diventano una forma sola) e ritorno alla
 *    forma di storage senza perdere i campi non gestiti;
 *  - operazioni di lista (aggiungi/elimina/sposta) immutabili;
 *  - modello a BLOCCHI della sintesi (h3/h4/p/li/blockquote): stessi tag del foglio
 *    stampato → il lettore TTS continua a trovare i suoi blocchi;
 *  - sanitizzazione dello stile inline (whitelist b/i/u/span[color]/sup/br): sono
 *    tag INLINE, non alterano il numero di blocchi (e quindi i cue dell'audio);
 *  - cronologia per l'annulla (stack con cap), slot colore del picker.
 *
 * UMD: window.MappAIDocEdit (browser) / module.exports (Node/test).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIDocEdit = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ── util ────────────────────────────────────────────────────────────────
    function _s(v) { return String(v == null ? '' : v); }
    function _trim(v) { return _s(v).trim(); }
    function _clone(o) { return JSON.parse(JSON.stringify(o)); }

    function escHtml(s) {
        return _s(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── 1. ITEM: forma unica ────────────────────────────────────────────────
    // In archivio convivono tre forme: generateDynamicQuiz produce {q, options,
    // correct(stringa o indice 1-based), explanation}; le flashcard {front, back};
    // i builder di stampa leggono {question, options, correctIndex}. Qui: una sola.

    /** Indice dell'opzione corretta a partire da `correct` (testo o numero 1-based). */
    function correctIndexOf(options, correct) {
        var opts = Array.isArray(options) ? options : [];
        var corr = _trim(correct).toLowerCase();
        for (var i = 0; i < opts.length; i++) {
            if (_trim(opts[i]).toLowerCase() === corr) return i;
        }
        var nn = parseInt(correct, 10);
        if (!isNaN(nn) && nn >= 1 && nn <= opts.length) return nn - 1;
        return -1;
    }

    /** Opzioni scritte come campi separati a1/a2/a3… (quiz per nodo, dungeon). */
    function _optsFromAn(it) {
        var out = [];
        for (var i = 1; i <= 6; i++) {
            var v = it['a' + i];
            if (v == null || _trim(v) === '') break;
            out.push(_s(v));
        }
        return out;
    }

    /** 'aN' se il set scrive le opzioni come a1/a2/a3, 'options' se usa un array. */
    function shapeOfItems(items) {
        var arr = Array.isArray(items) ? items : [];
        for (var i = 0; i < arr.length; i++) {
            var it = arr[i] || {};
            if (Array.isArray(it.options) && it.options.length) return 'options';
            if (it.a1 != null) return 'aN';
        }
        return 'options';
    }

    /** Un item qualsiasi (quiz o flashcard, forma storica o già stampabile) → forma unica. */
    function normItem(it) {
        it = it || {};
        var opts = Array.isArray(it.options) ? it.options.map(_s) : _optsFromAn(it);
        var ci = (typeof it.correctIndex === 'number' && it.correctIndex >= 0 && it.correctIndex < opts.length)
            ? it.correctIndex
            : correctIndexOf(opts, it.correct);
        var answer = (ci >= 0 && opts[ci] != null)
            ? _s(opts[ci])
            : _s(it.answer != null ? it.answer : (it.back != null ? it.back : it.correct));
        return {
            question: _s(it.question || it.q || it.stem || it.front || ''),
            options: opts,
            correctIndex: ci,
            answer: answer,
            explanation: _s(it.explanation || '')
        };
    }

    function normItems(items) { return (Array.isArray(items) ? items : []).map(normItem); }

    /** 'flashcards' se il set è una serie di carte, altrimenti 'quiz'. */
    function kindOfSet(set) {
        set = set || {};
        var t = _trim(set.type).toLowerCase();
        if (set.mode === 'flashcard' || set.mode === 'flashcards' || /flashcard/.test(t)) return 'flashcards';
        return 'quiz';
    }

    /** Vero se tutte le domande sono Vero/Falso (2 opzioni, vero+falso/true+false). */
    function isTrueFalse(items) {
        var its = normItems(items);
        if (!its.length) return false;
        return its.every(function (it) {
            if (it.options.length !== 2) return false;
            var a = _trim(it.options[0]).toLowerCase(), b = _trim(it.options[1]).toLowerCase();
            var set = [a, b].sort().join('|');
            return set === 'falso|vero' || set === 'false|true';
        });
    }

    /** Set di studio (archivio) → documento editabile. */
    function docFromSet(set) {
        set = set || {};
        var kind = kindOfSet(set);
        var items = normItems(set.items);
        return {
            id: _s(set.id),
            kind: kind,
            title: _s(set.title || ''),
            type: _s(set.type || (kind === 'flashcards' ? 'Flashcard' : 'Quiz')),
            quizType: isTrueFalse(items) ? 'tf' : (kind === 'flashcards' ? 'flash' : 'mc'),
            // Forma di storage da rispettare al ritorno: i quiz per nodo/ramo usano
            // a1/a2/a3 + correct numerico e il player in-app legge QUELLI.
            shape: shapeOfItems(set.items),
            items: items,
            rev: 0
        };
    }

    /** Item in forma unica → forma di STORAGE (kind + shape del set d'origine). */
    function denormItem(it, kind, shape) {
        var n = normItem(it);
        if (kind === 'flashcards') {
            return { front: n.question, back: n.answer, explanation: n.explanation };
        }
        if (shape === 'aN') {
            var out2 = { q: n.question, correct: (n.correctIndex >= 0 ? n.correctIndex + 1 : 1) };
            n.options.slice(0, 6).forEach(function (o, i) { out2['a' + (i + 1)] = o; });
            if (n.explanation) out2.explanation = n.explanation;
            return out2;
        }
        var out = { q: n.question, options: n.options.slice(), explanation: n.explanation };
        out.correct = (n.correctIndex >= 0 && n.options[n.correctIndex] != null) ? n.options[n.correctIndex] : n.answer;
        return out;
    }

    /**
     * Riporta il documento editato nel set di studio, PRESERVANDO i campi non
     * gestiti (angle, quantity, date, _pipeline…) e soprattutto lo stesso `id`:
     * l'archivio si aggiorna, non si duplica.
     */
    function applyToSet(set, doc) {
        var out = _clone(set || {});
        var kind = (doc && doc.kind) || kindOfSet(out);
        var shape = (doc && doc.shape) || shapeOfItems(out.items);
        out.items = ((doc && doc.items) || []).map(function (it) { return denormItem(it, kind, shape); });
        if (doc && doc.title) out.title = doc.title;
        out.editedAt = (doc && doc.editedAt) || null;
        return out;
    }

    // ── 2. operazioni di lista (immutabili) ─────────────────────────────────
    function blankItem(kind, nOptions) {
        if (kind === 'flashcards') return { question: '', options: [], correctIndex: -1, answer: '', explanation: '' };
        var n = (typeof nOptions === 'number' && nOptions > 0) ? nOptions : 3;
        var opts = []; for (var i = 0; i < n; i++) opts.push('');
        return { question: '', options: opts, correctIndex: 0, answer: '', explanation: '' };
    }

    /** Nuovo item coerente col documento (V/F → opzioni Vero/Falso, MC → tante opzioni quanto le altre). */
    function blankItemFor(doc) {
        var kind = (doc && doc.kind) || 'quiz';
        if (kind === 'flashcards') return blankItem('flashcards');
        if (doc && doc.quizType === 'tf') {
            return { question: '', options: ['Vero', 'Falso'], correctIndex: 0, answer: 'Vero', explanation: '' };
        }
        var items = (doc && doc.items) || [];
        var n = items.length ? (items[items.length - 1].options || []).length : 3;
        return blankItem('quiz', n || 3);
    }

    function insertAt(items, index, item) {
        var arr = (items || []).slice();
        var i = Math.max(0, Math.min(arr.length, index == null ? arr.length : index));
        arr.splice(i, 0, item);
        return arr;
    }
    function removeAt(items, index) {
        var arr = (items || []).slice();
        if (index < 0 || index >= arr.length) return arr;
        arr.splice(index, 1);
        return arr;
    }
    function moveItem(items, from, to) {
        var arr = (items || []).slice();
        if (from < 0 || from >= arr.length) return arr;
        var t = Math.max(0, Math.min(arr.length - 1, to));
        var it = arr.splice(from, 1)[0];
        arr.splice(t, 0, it);
        return arr;
    }

    /**
     * Aggiorna un campo dell'item i-esimo mantenendo la coerenza:
     * cambiare il testo dell'opzione corretta aggiorna anche `answer`.
     * path: 'question' | 'explanation' | 'answer' | 'correctIndex' | 'option:<n>'
     */
    function setField(items, index, path, value) {
        var arr = (items || []).map(function (x) { return normItem(x); });
        if (index < 0 || index >= arr.length) return arr;
        var it = arr[index];
        var m = /^option:(\d+)$/.exec(_s(path));
        if (m) {
            var oi = parseInt(m[1], 10);
            if (oi >= 0 && oi < it.options.length) it.options[oi] = _s(value);
        } else if (path === 'correctIndex') {
            var ci = parseInt(value, 10);
            it.correctIndex = (isNaN(ci) || ci < 0 || ci >= it.options.length) ? -1 : ci;
        } else if (path === 'question' || path === 'explanation' || path === 'answer') {
            it[path] = _s(value);
        }
        if (it.correctIndex >= 0 && it.options[it.correctIndex] != null) it.answer = it.options[it.correctIndex];
        arr[index] = it;
        return arr;
    }

    function addOption(items, index) {
        var arr = (items || []).map(normItem);
        if (index < 0 || index >= arr.length) return arr;
        if (arr[index].options.length >= 6) return arr;   // 6 = A…F, oltre il foglio non regge
        arr[index].options = arr[index].options.concat(['']);
        return arr;
    }
    function removeOption(items, index, oi) {
        var arr = (items || []).map(normItem);
        if (index < 0 || index >= arr.length) return arr;
        var it = arr[index];
        if (it.options.length <= 2 || oi < 0 || oi >= it.options.length) return arr;
        it.options = it.options.slice(0, oi).concat(it.options.slice(oi + 1));
        if (it.correctIndex === oi) it.correctIndex = 0;
        else if (it.correctIndex > oi) it.correctIndex -= 1;
        if (it.options[it.correctIndex] != null) it.answer = it.options[it.correctIndex];
        return arr;
    }

    /** Problemi che rendono il foglio inutilizzabile (mostrati, mai bloccanti). */
    function validateDoc(doc) {
        var out = [];
        var items = (doc && doc.items) || [];
        if (!items.length) out.push({ index: -1, code: 'empty', msg: 'Nessuna domanda nel documento.' });
        items.forEach(function (it, i) {
            var n = normItem(it);
            if (!_trim(n.question)) out.push({ index: i, code: 'no-question', msg: 'Domanda ' + (i + 1) + ': testo vuoto.' });
            if ((doc.kind || 'quiz') === 'flashcards') {
                if (!_trim(n.answer)) out.push({ index: i, code: 'no-answer', msg: 'Carta ' + (i + 1) + ': retro vuoto.' });
                return;
            }
            if (n.options.length < 2) out.push({ index: i, code: 'few-options', msg: 'Domanda ' + (i + 1) + ': meno di 2 opzioni.' });
            if (n.options.some(function (o) { return !_trim(o); })) out.push({ index: i, code: 'blank-option', msg: 'Domanda ' + (i + 1) + ': un\'opzione è vuota.' });
            if (n.correctIndex < 0) out.push({ index: i, code: 'no-correct', msg: 'Domanda ' + (i + 1) + ': nessuna risposta corretta segnata.' });
        });
        return out;
    }

    // ── 3. STILE INLINE: whitelist ──────────────────────────────────────────
    // Ammessi SOLO tag inline: non cambiano il numero di blocchi → i cue dell'audio
    // e la struttura del foglio restano validi. Nessun controllo di dimensione: la
    // taglia del testo dipende dal tag di blocco (h3/h4/p/li), non dall'inline.
    // 'font' non è ammesso in uscita: è quello che document.execCommand produce per
    // il colore quando styleWithCSS è spento → lo convertiamo in <span style="color:…">.
    var INLINE_OK = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', sup: 'sup', br: 'br', span: 'span', font: 'span' };

    function normColor(v) {
        var c = _trim(v).toLowerCase();
        var m = /^#([0-9a-f]{3})$/.exec(c);
        if (m) return '#' + m[1][0] + m[1][0] + m[1][1] + m[1][1] + m[1][2] + m[1][2];
        m = /^#([0-9a-f]{6})$/.exec(c);
        if (m) return '#' + m[1];
        m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/.exec(c);
        if (m) {
            var hex = [1, 2, 3].map(function (i) {
                var n = Math.max(0, Math.min(255, parseInt(m[i], 10)));
                return (n < 16 ? '0' : '') + n.toString(16);
            }).join('');
            return '#' + hex;
        }
        return null;
    }

    /**
     * Ripulisce l'HTML prodotto da un campo contenteditable: tiene grassetto,
     * corsivo, sottolineato, colore del font, citazioni <sup> e <br>; butta tutto
     * il resto conservandone il testo. I nodi di testo arrivano già escapati dal
     * browser: NON si ri-escapano (sarebbe doppia escape), si neutralizzano solo
     * i '<' orfani.
     */
    function sanitizeInline(html) {
        var src = _s(html);
        var out = '';
        var open = [];                    // stack dei tag realmente emessi
        // Tag SCARTATI ma ancora aperti nell'input: la loro chiusura va ingoiata,
        // altrimenti chiuderebbe per sbaglio il tag emesso più esterno (es. uno
        // <span> senza colore dentro uno <span> colorato tronca il colore).
        var dropped = 0;
        var re = /<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
        var last = 0, m;
        function text(chunk) { out += chunk.replace(/</g, '&lt;'); }
        while ((m = re.exec(src)) !== null) {
            text(src.slice(last, m.index));
            last = re.lastIndex;
            var raw = m[0], tag = m[1].toLowerCase(), attrs = m[2] || '';
            var closing = raw.charAt(1) === '/';
            var keep = INLINE_OK[tag];
            if (!keep) continue;                              // tag non ammesso → via, testo salvo
            if (keep === 'br') { if (!closing) out += '<br>'; continue; }
            if (closing) {
                // Chiusura di uno span/font che avevamo scartato (senza colore
                // valido): va ingoiata, non deve chiudere lo span colorato esterno.
                if (keep === 'span' && dropped > 0) { dropped--; continue; }
                var k = open.lastIndexOf(keep);
                if (k < 0) continue;                          // chiusura orfana
                for (var j = open.length - 1; j >= k; j--) out += '</' + open[j] + '>';
                open.length = k;
                continue;
            }
            if (keep === 'span') {
                var col = null;
                var sm = /style\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
                if (sm) {
                    var style = sm[2] != null ? sm[2] : (sm[3] || '');
                    var cm = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style);
                    if (cm) col = normColor(cm[1]);
                }
                if (!col && tag === 'font') {
                    var fm = /color\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
                    if (fm) col = normColor(fm[2] != null ? fm[2] : (fm[3] != null ? fm[3] : fm[4]));
                }
                if (!col) { dropped++; continue; }            // span senza colore valido → inutile
                out += '<span style="color:' + col + '">';
                open.push('span');
                continue;
            }
            out += '<' + keep + '>';
            open.push(keep);
        }
        text(src.slice(last));
        for (var z = open.length - 1; z >= 0; z--) out += '</' + open[z] + '>';
        return out
            .replace(/<(b|i|u|sup|span)([^>]*)><\/\1>/g, '')          // coppie vuote
            // Il browser lascia un <br> "fantasma" in coda al blocco (e ne mette due
            // per un solo Invio): nel foglio stampato diventerebbero righe vuote.
            .replace(/(?:<br>\s*){2,}/g, '<br>')
            .replace(/(?:<br>\s*)+$/, '');
    }

    /** Testo semplice di un frammento inline (per TTS, ricerca, conteggi). */
    function plainText(html) {
        return _s(html)
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // ── 4. SINTESI: modello a blocchi ───────────────────────────────────────
    // Stessi tag del foglio stampato (h3/h4/p/li/blockquote) → il lettore TTS
    // continua a trovare i suoi blocchi e le citazioni <sup> restano al loro posto.
    var BLOCK_OK = { h3: 1, h4: 1, p: 1, li: 1, blockquote: 1 };

    // Trova la chiusura di un <div> tenendo conto dei div annidati.
    function _divEnd(src, from) {
        var re = /<\/?div\b[^>]*>/gi;
        re.lastIndex = from;
        var depth = 0, m;
        while ((m = re.exec(src)) !== null) {
            if (m[0].charAt(1) === '/') { depth--; if (depth === 0) return re.lastIndex; }
            else depth++;
        }
        return -1;
    }

    /**
     * HTML del corpo sintesi → [{tag, html}] in ORDINE DI DOCUMENTO.
     * I <div> di primo livello (citazioni numerate, box «catena dei perché»)
     * diventano blocchi `raw`: non si editano, ma restano dove sono. Senza questo
     * la sintesi «tutta la mappa» — che ha le citazioni DENTRO il corpo, sezione
     * per sezione — le perderebbe al primo salvataggio.
     */
    function blocksFromHtml(html) {
        var src = _s(html), out = [], i = 0;
        var reBlock = /^<(h3|h4|p|li|blockquote)\b[^>]*>/i;
        while (i < src.length) {
            var lt = src.indexOf('<', i);
            if (lt < 0) break;
            var rest = src.slice(lt, lt + 200);
            var mb = reBlock.exec(rest);
            if (mb) {
                var tag = mb[1].toLowerCase();
                var openEnd = lt + mb[0].length;
                var close = src.toLowerCase().indexOf('</' + tag + '>', openEnd);
                if (close < 0) { i = openEnd; continue; }
                var inner = sanitizeInline(src.slice(openEnd, close));
                if (plainText(inner)) out.push({ tag: tag, html: inner });   // vuoti fuori: falserebbero i cue
                i = close + tag.length + 3;
                continue;
            }
            if (/^<div\b/i.test(rest)) {
                var end = _divEnd(src, lt);
                if (end < 0) { i = lt + 4; continue; }
                var rawHtml = src.slice(lt, end);
                if (plainText(rawHtml)) out.push({ tag: 'raw', html: rawHtml });
                i = end;
                continue;
            }
            i = lt + 1;
        }
        return out;
    }

    /** [{tag, html}] → HTML del corpo (li consecutivi raggruppati in un solo <ul>). */
    function blocksToHtml(blocks) {
        var arr = (blocks || []).filter(function (b) { return b && (BLOCK_OK[b.tag] || b.tag === 'raw'); });
        var out = '', inList = false;
        arr.forEach(function (b) {
            if (b.tag === 'raw') {                            // generato: verbatim, mai sanitizzato
                if (inList) { out += '</ul>'; inList = false; }
                out += b.html;
                return;
            }
            var inner = sanitizeInline(b.html);
            if (b.tag === 'li') {
                if (!inList) { out += '<ul>'; inList = true; }
                out += '<li>' + inner + '</li>';
                return;
            }
            if (inList) { out += '</ul>'; inList = false; }
            out += '<' + b.tag + '>' + inner + '</' + b.tag + '>';
        });
        if (inList) out += '</ul>';
        return out;
    }

    function moveBlock(blocks, from, to) { return moveItem(blocks, from, to); }
    function removeBlock(blocks, i) { return removeAt(blocks, i); }
    function insertBlock(blocks, i, tag) { return insertAt(blocks, i, { tag: BLOCK_OK[tag] ? tag : 'p', html: '' }); }

    /**
     * L'audio della voce naturale è allineato ai BLOCCHI: se cambia il loro numero
     * (o il testo), i cue non corrispondono più. `true` = l'audio va rigenerato.
     */
    function audioStale(before, after) {
        // I blocchi `raw` (citazioni, box generati) non vengono letti ad alta voce:
        // fuori dal confronto, altrimenti invaliderebbero l'audio per nulla.
        var noRaw = function (x) { return (x || []).filter(function (b) { return b && b.tag !== 'raw'; }); };
        var a = noRaw(before), b = noRaw(after);
        if (a.length !== b.length) return true;
        for (var i = 0; i < a.length; i++) {
            if (a[i].tag !== b[i].tag) return true;
            if (plainText(a[i].html) !== plainText(b[i].html)) return true;
        }
        return false;
    }

    // ── 5. cronologia (annulla) ─────────────────────────────────────────────
    function createHistory(cap) {
        var max = (typeof cap === 'number' && cap > 0) ? cap : 20;
        var stack = [];
        return {
            push: function (state, label) {
                stack.push({ state: _clone(state), label: _s(label) });
                if (stack.length > max) stack.shift();
                return stack.length;
            },
            undo: function () {
                if (!stack.length) return null;
                return stack.pop();
            },
            peekLabel: function () { return stack.length ? stack[stack.length - 1].label : ''; },
            canUndo: function () { return stack.length > 0; },
            size: function () { return stack.length; },
            clear: function () { stack.length = 0; }
        };
    }

    // ── 6. slot colore del picker ───────────────────────────────────────────
    var COLOR_SLOTS = 5;
    var DEFAULT_SLOTS = ['#1e293b', '#4f46e5', '#dc2626', '#059669', '#d97706'];

    /** Aggiunge un colore in testa agli slot (dedup, cap 5). Ritorna un nuovo array. */
    function pushColorSlot(slots, hex) {
        var c = normColor(hex);
        if (!c) return (slots || []).slice(0, COLOR_SLOTS);
        var arr = (slots || []).map(normColor).filter(Boolean).filter(function (x) { return x !== c; });
        return [c].concat(arr).slice(0, COLOR_SLOTS);
    }

    // ── 7. formati foglio flashcard ─────────────────────────────────────────
    // Stessa geometria dei fogli nodi (A4 landscape, tratteggio arancio di taglio).
    var FLASH_FMT = {
        '2x1': { cols: 2, rows: 1, perPage: 2 },
        '2x2': { cols: 2, rows: 2, perPage: 4 },
        '4x3': { cols: 4, rows: 3, perPage: 12 }
    };
    function flashFmt(v) { return FLASH_FMT[v] ? v : '2x2'; }
    /** Numero di pagine (fronte, o fronte+retro se `backside`). */
    function flashPages(nItems, fmt, backside) {
        var f = FLASH_FMT[flashFmt(fmt)];
        var sheets = Math.ceil((nItems || 0) / f.perPage);
        return backside ? sheets * 2 : sheets;
    }
    /**
     * Ordine delle carte sul RETRO: la stampa fronte/retro ribalta sul lato lungo,
     * quindi ogni riga va specchiata in orizzontale, altrimenti il retro finisce
     * sulla carta sbagliata. Ritorna gli indici (null = casella vuota).
     */
    function backsideOrder(pageItems, fmt) {
        var f = FLASH_FMT[flashFmt(fmt)];
        var out = [];
        for (var r = 0; r < f.rows; r++) {
            for (var c = f.cols - 1; c >= 0; c--) {
                var idx = r * f.cols + c;
                out.push(idx < pageItems ? idx : null);
            }
        }
        return out;
    }

    return {
        // item
        normItem: normItem, normItems: normItems, correctIndexOf: correctIndexOf, shapeOfItems: shapeOfItems,
        kindOfSet: kindOfSet, isTrueFalse: isTrueFalse, docFromSet: docFromSet,
        denormItem: denormItem, applyToSet: applyToSet, validateDoc: validateDoc,
        // liste
        blankItem: blankItem, blankItemFor: blankItemFor, insertAt: insertAt, removeAt: removeAt,
        moveItem: moveItem, setField: setField, addOption: addOption, removeOption: removeOption,
        // inline / blocchi
        sanitizeInline: sanitizeInline, plainText: plainText, normColor: normColor, escHtml: escHtml,
        blocksFromHtml: blocksFromHtml, blocksToHtml: blocksToHtml, moveBlock: moveBlock,
        removeBlock: removeBlock, insertBlock: insertBlock, audioStale: audioStale,
        // cronologia / colori / formati
        createHistory: createHistory, pushColorSlot: pushColorSlot,
        COLOR_SLOTS: COLOR_SLOTS, DEFAULT_SLOTS: DEFAULT_SLOTS,
        FLASH_FMT: FLASH_FMT, flashFmt: flashFmt, flashPages: flashPages, backsideOrder: backsideOrder
    };
});
