/*
 * mappai-figure.js — la lettura delle figure dei PDF quando il PDF entra in CREA (packet 0113, ADR 0024, lotto 3).
 * ---------------------------------------------------------------------------------------------------------------
 * Il modulo MISURA e CHIAMA; non decide (invariante 4): ogni soglia, stato, smistamento, accordo e marcatore vive nel
 * core puro `mappai-figure-core.js` (`window.MappAIFigureCore`). Qui stanno le cose che hanno bisogno del browser e di
 * Electron: pdf.js (gli oggetti immagine seguendo la CTM in `getOperatorList`, le righe di testo con le coordinate da
 * `getTextContent`, i pixel nativi da `page.objs`), i ritagli sul canvas col piano di compressione, Tesseract nel worker
 * (tesseract.js 7 in `js/vendor/tesseract/`, lingue in `assets/tesseract/`, uno scheduler di 3 worker: misurato il 19/10,
 * 19 ritagli del banco in 2,5 s), la quota a tinte piatte, le chiamate ai modelli (Infomaniak via ponte con `immagini:
 * true` e `penalita: false`; con Google come fornitore Gemini 4 Argon via `electronAPI.generateGemini`, MAI `fetchModelAPI`,
 * e la riga del Registro consumi scritta qui), la cache in memoria finché il vault non c'è, il `.figure.json`.
 *
 * Interruttore `mappai_figure` (acceso salvo '0') e origine: li legge `attiva(origine)`, la regola è nel core (inv. 6).
 * Senza questo modulo (il reader non lo carica) `extractPdfPages` è identico a oggi (inv. 1): il lotto 4 lo garantisce.
 *
 * API (per il lotto 4 e 5):
 *   MappAIFigure.attiva(origine)                       → bool
 *   MappAIFigure.prova(pdf, { nome })                  → la prova a secco: misura + decisioni locali (Tesseract, tinte), zero chiamate
 *   MappAIFigure.stima(prova, { lingua })              → la riga della stima prima del clic (core.stima coi prezzi del catalogo)
 *   MappAIFigure.leggi(prova, { origine, vaultPath, nome, google, onProgresso, annullato }) → { pagine, dossier, riassunto, avvisi }
 *   MappAIFigure.scriviDossier(vaultPath, impronta)    → scrive Fonti/<nome>.figure.json (solo se il vault c'è, percorsi relativi)
 *   MappAIFigure.dossierDi(impronta)                   → il dossier in memoria (per ELABORA e per flushSourcesToVault)
 *   MappAIFigure.aggiornaStima()                       → la riga «Lettura delle figure: …» sotto #estimator-cost (lotto 5)
 *   MappAIFigure.opzioniCrea(src) / fineCrea(file)     → le opzioni delle due chiamate di CREA (velo, «Salta le figure»,
 *                                                         domanda Google) e il toast finale (lotto 5)
 *   MappAIFigure.trovaDossier({ impronta, nome, vaultPath }) → il dossier in memoria o dal .figure.json del vault (lotto 8, ELABORA)
 *   MappAIFigure.leggiUno(prova, identita, { vaultPath, nome }) → «Leggi comunque»: titolare, poi il controllo se legge testo
 *   MappAIFigure.rileggiPagina(prova, identita, { google: true, vaultPath, nome }) → «Rileggi con Google» su una pagina scansione
 *   MappAIFigure.correggi(impronta, identita, testo, { vaultPath }) / conferma(impronta, identita, { vaultPath })
 *   MappAIFigure._deps                                 → le dipendenze sostituibili nelle prove in Node (pdf, canvas, ocr, rete)
 */
(function () {
    'use strict';
    if (typeof window === 'undefined' || window.MappAIFigure) return;

    var VERSIONE = '0113-lotto8';
    var WORKER_OCR = 3;                       // misurato il 19/10: 1 → 303 ms a ritaglio, 3 → 133
    var LINGUA_OCR = 'ita';                   // `eng` solo quando la lingua delle mappe è l'inglese (Giacomo, 19/10)
    var PPI_SCANSIONE = 170, PPI_FORMULE = 200;
    var VENDOR = 'js/vendor/tesseract/', LINGUE = 'assets/tesseract';

    function CORE() { return window.MappAIFigureCore; }
    function API() { return window.electronAPI; }
    function PONTE() { return window.InfomaniakBridge; }
    // i testi dell'interfaccia: la chiave nei dizionari, il fallback è l'italiano (CLAUDE.md regola 13); senza `window.t` (prove in Node) resta l'italiano
    function _t(k, f) { try { if (typeof window.t === 'function') return window.t(k, f); } catch (e) { /* resta l'italiano */ } return f; }
    function toast(m, tipo) { if (window.showToast) { try { window.showToast(m, tipo || 'info'); } catch (e) { /* niente */ } } }
    function _st() { try { return (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { return window.appState; } }
    function _ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lingua() { try { return (typeof window.getMapLanguage === 'function' && window.getMapLanguage() === 'en') ? 'en' : 'it'; } catch (e) { return 'it'; } }
    function r1(x) { return Math.round(x * 10) / 10; }
    function adesso() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

    /* ── le dipendenze sostituibili (prove in Node) ───────────────────────── */
    var deps = {
        pdfjs: function () { return window.pdfjsLib; },
        creaCanvas: function (w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
        caricaImmagine: function (dataUrl) {
            return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = dataUrl; });
        },
        tesseract: function () { return window.Tesseract; },
        // il bundle di Tesseract non sta in index.html (pesa): si carica alla prima lettura, una volta; senza `document.head` (prove in Node) non fa nulla
        caricaTesseract: function () {
            if (window.Tesseract) return Promise.resolve(window.Tesseract);
            if (typeof document === 'undefined' || !document.head || typeof document.head.appendChild !== 'function') return Promise.resolve(null);
            if (!caricaTesseractPromessa) {
                caricaTesseractPromessa = new Promise(function (res) {
                    var sc = document.createElement('script'), fatto = false;
                    var chiudi = function () { if (!fatto) { fatto = true; res(window.Tesseract || null); } };
                    sc.src = urlDi(VENDOR + 'tesseract.min.js'); sc.onload = chiudi; sc.onerror = chiudi;
                    setTimeout(chiudi, 15000);
                    document.head.appendChild(sc);
                });
            }
            return caricaTesseractPromessa;
        },
        ora: function () { return new Date().toISOString(); },
        impronta: null                        // se c'è, sostituisce il calcolo con crypto.subtle (prove)
    };

    /* ── attiva (inv. 6): la regola è nel core, qui si legge solo l'interruttore ── */
    function attiva(origine) { var C = CORE(); return !!C && C.attiva(_ls('mappai_figure'), origine); }

    /* ── pdf.js: oggetti immagine seguendo la CTM (come descrittore.js della prova B3) ── */
    function rettDaMatrice(Util, m, vt) {
        var M = Util.transform(vt, m);
        var xs = [], ys = [];
        [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (uv) { xs.push(M[0] * uv[0] + M[2] * uv[1] + M[4]); ys.push(M[1] * uv[0] + M[3] * uv[1] + M[5]); });
        var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
        return { x: x0, y: y0, w: Math.max.apply(null, xs) - x0, h: Math.max.apply(null, ys) - y0 };
    }
    function oggettiImmagine(lib, ol, vt, occ) {
        var OPS = lib.OPS, Util = lib.Util;
        var out = [], ctm = [1, 0, 0, 1, 0, 0], pila = [], vis = [], forma = 0;
        var visibile = function () { return vis.every(Boolean); };
        var emetti = function (m, pw, ph, tipo, id) {
            var r = rettDaMatrice(Util, m, vt);
            r.px = (pw && ph) ? [pw, ph] : null; r.tipo = tipo; r.id = id || null; r.visibile = visibile();
            out.push(r);
        };
        var fn = ol.fnArray, aa = ol.argsArray;
        for (var i = 0; i < fn.length; i++) {
            var op = fn[i], a = aa[i];
            switch (op) {
                case OPS.save: pila.push(ctm); break;
                case OPS.restore: ctm = pila.length ? pila.pop() : ctm; break;
                case OPS.transform: ctm = Util.transform(ctm, a); break;
                case OPS.paintFormXObjectBegin: pila.push(ctm); forma++; if (Array.isArray(a[0]) && a[0].length === 6) ctm = Util.transform(ctm, a[0]); break;
                case OPS.paintFormXObjectEnd: ctm = pila.length ? pila.pop() : ctm; forma--; break;
                case OPS.beginGroup: pila.push(ctm); break;
                case OPS.endGroup: ctm = pila.length ? pila.pop() : ctm; break;
                case OPS.beginAnnotation: { pila.push(ctm); var m = [1, 0, 0, 1, 0, 0]; if (Array.isArray(a[2])) m = Util.transform(m, a[2]); if (Array.isArray(a[3])) m = Util.transform(m, a[3]); ctm = m; break; }
                case OPS.endAnnotation: ctm = pila.length ? pila.pop() : ctm; break;
                case OPS.beginMarkedContentProps: vis.push(a[0] === 'OC' && occ ? occ.isVisible(a[1]) : true); break;
                case OPS.beginMarkedContent: vis.push(true); break;
                case OPS.endMarkedContent: vis.pop(); break;
                case OPS.paintImageXObject: emetti(ctm, a[1], a[2], 'xobject', a[0]); break;
                case OPS.paintInlineImageXObject: emetti(ctm, a[0] && a[0].width, a[0] && a[0].height, 'inline'); break;
                case OPS.paintInlineImageXObjectGroup: (a[1] || []).forEach(function (e) { emetti(Util.transform(ctm, e.transform), e.w, e.h, 'inline-gruppo'); }); break;
                case OPS.paintImageXObjectRepeat: { var pos = a[3] || []; for (var k = 0; k < pos.length; k += 2) emetti(Util.transform(ctm, [a[1], 0, 0, a[2], pos[k], pos[k + 1]]), null, null, 'xobject-ripetuta', a[0]); break; }
                case OPS.paintImageMaskXObject: emetti(ctm, a[0] && a[0].width, a[0] && a[0].height, 'maschera'); break;
                case OPS.paintImageMaskXObjectGroup: (a[0] || []).forEach(function (im) { emetti(Util.transform(ctm, im.transform), im.width, im.height, 'maschera-gruppo'); }); break;
                case OPS.paintImageMaskXObjectRepeat: { var p2 = a[5] || []; for (var q = 0; q < p2.length; q += 2) emetti(Util.transform(ctm, [a[1], a[2], a[3], a[4], p2[q], p2[q + 1]]), a[0] && a[0].width, a[0] && a[0].height, 'maschera-ripetuta'); break; }
                case OPS.paintSolidColorImageMask: emetti(ctm, 1, 1, 'maschera-1px'); break;
                default: break;
            }
        }
        return out;
    }
    function pixelDaObjs(page, ids) {
        var esito = {};
        return ids.reduce(function (p, id) {
            return p.then(function () {
                var objs = id.indexOf('g_') === 0 ? page.commonObjs : page.objs;
                return new Promise(function (res) {
                    var tm = setTimeout(function () { res(null); }, 4000);
                    try { objs.get(id, function (v) { clearTimeout(tm); res(v); }); } catch (e) { clearTimeout(tm); res(null); }
                }).then(function (o) {
                    var w = o && (o.width || (o.bitmap && o.bitmap.width)), h = o && (o.height || (o.bitmap && o.bitmap.height));
                    if (w && h) esito[id] = [w, h];
                });
            });
        }, Promise.resolve()).then(function () { return esito; });
    }

    /* ── pdf.js: righe di testo con le coordinate (al posto di pdftotext -bbox-layout) ── */
    var RIGA = { base: 0.3, vuoto: 1.0, spazio: 0.12, asc: 0.8, disc: 0.2 };
    function pezziTesto(items, vt) {
        var pezzi = [];
        items.forEach(function (it) {
            if (typeof it.str !== 'string' || !it.str.trim()) return;
            var tr = it.transform, a = tr[0], b = tr[1], c = tr[2], d = tr[3], e = tr[4], f = tr[5];
            var fsz = Math.hypot(c, d) || it.height || 0;
            var lu = Math.hypot(a, b) || 1, lv = Math.hypot(c, d) || 1;
            var u = [a / lu, b / lu], v = [c / lv, d / lv], w = it.width || 0;
            var P0 = [e, f], P1 = [e + u[0] * w, f + u[1] * w], pts = [];
            [P0, P1].forEach(function (B) { [RIGA.asc, -RIGA.disc].forEach(function (s) { pts.push([B[0] + v[0] * s * fsz, B[1] + v[1] * s * fsz]); }); });
            var vp = pts.map(function (p) { return [vt[0] * p[0] + vt[2] * p[1] + vt[4], vt[1] * p[0] + vt[3] * p[1] + vt[5]]; });
            var base = vt[1] * e + vt[3] * f + vt[5];
            var dir = [vt[0] * u[0] + vt[2] * u[1], vt[1] * u[0] + vt[3] * u[1]];
            pezzi.push({ x0: Math.min.apply(null, vp.map(function (p) { return p[0]; })), x1: Math.max.apply(null, vp.map(function (p) { return p[0]; })),
                y0: Math.min.apply(null, vp.map(function (p) { return p[1]; })), y1: Math.max.apply(null, vp.map(function (p) { return p[1]; })),
                base: base, fs: fsz, str: it.str, orizz: Math.abs(dir[1]) < 0.05 * Math.abs(dir[0]) && dir[0] > 0 });
        });
        return pezzi;
    }
    function righeDaPezzi(pezzi) {
        var righe = [], aperte = [];
        var oriz = pezzi.filter(function (p) { return p.orizz; }).sort(function (p, q) { return p.base - q.base || p.x0 - q.x0; });
        oriz.forEach(function (p) {
            var migliore = null;
            aperte.forEach(function (r) {
                if (Math.abs(r.base - p.base) > RIGA.base * Math.min(r.fs, p.fs)) return;
                var vuoto = p.x0 - r.x1;
                if (vuoto > RIGA.vuoto * Math.max(r.fs, p.fs) || p.x1 < r.x0 - RIGA.vuoto * p.fs) return;
                if (!migliore || Math.abs(r.base - p.base) < Math.abs(migliore.base - p.base)) migliore = r;
            });
            if (migliore) { migliore.pezzi.push(p); migliore.x0 = Math.min(migliore.x0, p.x0); migliore.x1 = Math.max(migliore.x1, p.x1); migliore.y0 = Math.min(migliore.y0, p.y0); migliore.y1 = Math.max(migliore.y1, p.y1); migliore.fs = Math.max(migliore.fs, p.fs); }
            else { var r = { x0: p.x0, x1: p.x1, y0: p.y0, y1: p.y1, base: p.base, fs: p.fs, pezzi: [p] }; aperte.push(r); righe.push(r); }
        });
        pezzi.filter(function (p) { return !p.orizz; }).forEach(function (p) { righe.push({ x0: p.x0, x1: p.x1, y0: p.y0, y1: p.y1, base: p.base, fs: p.fs, pezzi: [p] }); });
        righe.forEach(function (r) {
            r.pezzi.sort(function (p, q) { return p.x0 - q.x0; });
            var s = '';
            r.pezzi.forEach(function (p, k) {
                if (k) { var prec = r.pezzi[k - 1]; if (p.x0 - prec.x1 > RIGA.spazio * Math.max(p.fs, prec.fs) && !/\s$/.test(s) && !/^\s/.test(p.str)) s += ' '; }
                s += p.str;
            });
            r.testo = s.replace(/\s+/g, ' ').trim();
        });
        return righe.map(function (r) { return { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, testo: r.testo }; });
    }

    /* ── l'impronta del PDF: SHA-256 dei byte (crypto.subtle), altrimenti l'impronta del core su un campione ── */
    function impronta(buffer) {
        if (deps.impronta) return Promise.resolve(deps.impronta(buffer));
        var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        try {
            if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
                return crypto.subtle.digest('SHA-256', bytes).then(function (h) {
                    return Array.prototype.map.call(new Uint8Array(h), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('').slice(0, 32);
                });
            }
        } catch (e) { /* ripiego */ }
        var passo = Math.max(1, Math.floor(bytes.length / 65536)), s = bytes.length + ':';
        for (var i = 0; i < bytes.length; i += passo) s += String.fromCharCode(bytes[i]);
        return Promise.resolve(CORE().impronta(s));
    }

    /* ── LA MISURA (la prova a secco, §5.7): pdf.js → descrittori → core; zero chiamate ── */
    function misura(sorgente, opz) {
        opz = opz || {};
        var C = CORE(), lib = deps.pdfjs();
        if (!C || !lib) return Promise.reject(new Error('figure: manca il core o pdf.js'));
        var t0 = adesso();
        var eBuffer = sorgente && (ArrayBuffer.isView(sorgente) || Object.prototype.toString.call(sorgente) === '[object ArrayBuffer]');
        var buffer = eBuffer ? sorgente : null;
        var pdfPromise = sorgente && sorgente.getPage ? Promise.resolve(sorgente)
            : lib.getDocument({ isEvalSupported: false, data: buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer) }).promise;
        var impr = buffer ? impronta(buffer) : (opz.buffer ? impronta(opz.buffer) : Promise.resolve(opz.impronta || null));
        return Promise.all([pdfPromise, impr]).then(function (r) {
            var pdf = r[0], pagine = [];
            var occP = Promise.resolve(null);
            try { occP = pdf.getOptionalContentConfig().catch(function () { return null; }); } catch (e) { occP = Promise.resolve(null); }
            return occP.then(function (occ) {
                var catena = Promise.resolve();
                for (var n = 1; n <= pdf.numPages; n++) {
                    (function (num) {
                        catena = catena.then(function () { return pdf.getPage(num); }).then(function (page) {
                            var vp = page.getViewport({ scale: 1 }), vt = vp.transform;
                            return page.getTextContent().then(function (tc) {
                                var caratteri = 0;
                                tc.items.forEach(function (it) { caratteri += (String(it.str || '').match(/[\p{L}\p{N}]/gu) || []).length; });
                                var righe = righeDaPezzi(pezziTesto(tc.items, vt));
                                return page.getOperatorList().then(function (ol) {
                                    var oggetti = oggettiImmagine(lib, ol, vt, occ);
                                    var ids = []; oggetti.forEach(function (o) { if (o.id && !o.px && ids.indexOf(o.id) < 0) ids.push(o.id); });
                                    return pixelDaObjs(page, ids).then(function (px) {
                                        oggetti.forEach(function (o) { if (o.id && !o.px && px[o.id]) o.px = px[o.id]; });
                                        var visibili = oggetti.filter(function (o) { return o.visibile; });
                                        pagine.push({ numero: num, larghezza: vp.width, altezza: vp.height, caratteri: caratteri,
                                            immagini: visibili.map(function (o) { return { x: o.x, y: o.y, w: o.w, h: o.h, px: o.px }; }),
                                            righe: righe, testo: righe.map(function (x) { return x.testo; }).join(' ') });
                                        try { page.cleanup(); } catch (e) { /* niente */ }
                                    });
                                });
                            });
                        });
                    })(n);
                }
                return catena.then(function () {
                    var S = C.statiPdf(pagine);
                    var esito = { versione: VERSIONE, impronta: r[1], nome: opz.nome || '', numPagine: pdf.numPages, pdfScansione: S.pdfScansione,
                        pagineScansione: S.pagineScansione, pagine: [], ms: 0 };
                    /* 0114, dal gate 3 (Giacomo: «1a»): la prova sta sulla fonte (`src._figure`) e il salvataggio automatico
                       trascrive le fonti in JSON. Il documento pdf.js (`_pdf`, con WorkerTransport) è circolare e faceva
                       fallire ogni salvataggio dopo una generazione con un PDF; le immagini dei ritagli peserebbero nel
                       cassetto. La prova vive solo in memoria, come il File: `_pdf` non enumerabile e `toJSON` che la toglie. */
                    Object.defineProperty(esito, '_pdf', { value: pdf, writable: true, configurable: true, enumerable: false });
                    Object.defineProperty(esito, 'toJSON', { value: function () { return undefined; }, configurable: true, enumerable: false });
                    pagine.forEach(function (p, i) {
                        var st = S.stati[i];
                        esito.pagine.push({ numero: p.numero, larghezza: p.larghezza, altezza: p.altezza, caratteri: p.caratteri, testo: p.testo, righe: p.righe,
                            stato: st.stato, tuttaPagina: !!st.tuttaPagina, ritagli: C.ritagli(p, { stato: st }), formule: st.formule, blocchi: st.blocchi, copertaPct: st.copertaPct });
                    });
                    esito.ms = Math.round(adesso() - t0);
                    return esito;
                });
            });
        });
    }

    /* ── i ritagli sul canvas (§5.3): pixel alla risoluzione limitata, JPEG, piano di compressione ── */
    function ritaglia(page, rett, ppi, opz) {
        opz = opz || {};
        var C = CORE(), piano = C.pianoCompressione(), mime = 'image/jpeg';
        var tenta = function (k) {
            var passo = piano[Math.min(k, piano.length - 1)];
            var sx = ppi[0] / 72 * passo.scala, sy = ppi[1] / 72 * passo.scala;
            var w = Math.max(1, Math.round(rett.w * sx)), h = Math.max(1, Math.round(rett.h * sy));
            var canvas = deps.creaCanvas(w, h);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
            var vp = page.getViewport({ scale: 1 });
            return Promise.resolve(page.render({ canvasContext: ctx, viewport: vp, transform: [sx, 0, 0, sy, -rett.x * sx, -rett.y * sy] }).promise).then(function () {
                var dataUrl = canvas.toDataURL(mime, passo.qualita / 100);
                var byte = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);
                if (byte <= C.SOGLIE.MAX_BYTE || k >= piano.length - 1) return { dataUrl: dataUrl, mime: mime, pixel: [w, h], qualita: passo.qualita, scala: passo.scala, byte: byte, tentativi: k + 1, canvas: canvas };
                return tenta(k + 1);
            });
        };
        return tenta(0);
    }

    /* ── la quota a tinte piatte (§5.4): 8 colori più frequenti a 5 bit per canale, ritaglio a 400 px ── */
    function tintePiatte(canvas) {
        var lato = 400, w = canvas.width, h = canvas.height;
        var f = Math.min(1, lato / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * f)), ch = Math.max(1, Math.round(h * f));
        var c = deps.creaCanvas(cw, ch), ctx = c.getContext('2d');
        ctx.drawImage(canvas, 0, 0, cw, ch);
        var d = ctx.getImageData(0, 0, cw, ch).data, conta = {}, n = cw * ch;
        for (var i = 0; i < d.length; i += 4) {
            var k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
            conta[k] = (conta[k] || 0) + 1;
        }
        var v = Object.keys(conta).map(function (k) { return conta[k]; }).sort(function (a, b) { return b - a; });
        var top = 0; for (var j = 0; j < Math.min(8, v.length); j++) top += v[j];
        return n ? top / n : 0;
    }

    /* ── Tesseract nel worker: uno scheduler, caricato alla prima lettura ── */
    var ocr = { scheduler: null, lingue: null, avvio: null, fallito: false }, caricaTesseractPromessa = null;
    function urlDi(rel) { try { return new URL(rel, window.location.href).href; } catch (e) { return rel; } }
    function lingueOcr() { return LINGUA_OCR + (lingua() === 'en' ? '+eng' : ''); }
    function avviaOcr() {
        var T = deps.tesseract();
        if (T) return avviaOcrCon(T);
        if (ocr.avvio) return ocr.avvio;
        return Promise.resolve(deps.caricaTesseract()).then(function (T2) { return avviaOcrCon(T2 || deps.tesseract()); });
    }
    function avviaOcrCon(T) {
        var lingue = lingueOcr();
        if (!T || !T.createScheduler || !T.createWorker) { ocr.fallito = true; return Promise.resolve(null); }
        if (ocr.scheduler && ocr.lingue === lingue) return Promise.resolve(ocr.scheduler);
        if (ocr.avvio && ocr.lingue === lingue) return ocr.avvio;
        var vecchio = ocr.scheduler; ocr.scheduler = null;
        if (vecchio) { try { vecchio.terminate(); } catch (e) { /* niente */ } }
        ocr.lingue = lingue;
        var opzioni = { workerPath: urlDi(VENDOR + 'worker.min.js'), corePath: urlDi(VENDOR), langPath: urlDi(LINGUE), gzip: true };
        /* 0114, D9: la configurazione dentro `ita.traineddata` dice `user_words_suffix special-words`, e Tesseract cerca
           `./ita.special-words` nel disco virtuale del worker: non c'è, e stampa «Error: failed to load ./ita.special-words»
           nella console. Non è un errore di un lavoro, quindi `errorHandler` non lo vede; un file vuoto accanto al
           `.traineddata` non basta (tesseract.js scarica solo il `.traineddata`). Il suffisso vuoto in init toglie la
           ricerca; la lettura è la stessa (misurato in Node il 21/10 su UDII4 p.1: 2041 caratteri identici, conf. 78). */
        var config = { user_words_suffix: '' };
        var s = T.createScheduler();
        var creati = [];
        for (var i = 0; i < WORKER_OCR; i++) creati.push(T.createWorker(lingue, 1, opzioni, config).then(function (w) { s.addWorker(w); }));
        ocr.avvio = Promise.all(creati).then(function () { ocr.scheduler = s; ocr.fallito = false; return s; })
            .catch(function (e) { ocr.fallito = true; ocr.avvio = null; console.warn('[figure] Tesseract non parte: ' + (e && e.message || e)); return null; });
        return ocr.avvio;
    }
    function leggiOcr(dataUrl) {
        return avviaOcr().then(function (s) {
            if (!s) return null;
            return s.addJob('recognize', dataUrl).then(function (r) { return r && r.data ? String(r.data.text || '') : ''; })
                .catch(function (e) { console.warn('[figure] Tesseract: ' + (e && e.message || e)); return null; });
        });
    }

    /* ── fornitore, chiavi, modelli, prompt ───────────────────────────────── */
    function fornitore() { return (_st() || {}).aiProvider || 'google'; }
    function chiavi() {
        var g = window.getProviderKey ? window.getProviderKey('infomaniak') : '';
        var k = window.getProviderKey ? window.getProviderKey('google') : '';
        return { infomaniak: g || '', google: k || '' };
    }
    function productId() {
        var el = (typeof document !== 'undefined') && document.getElementById('infomaniak-product-id');
        return (el && el.value) || (_st() || {}).infomaniakProductId || '';
    }
    var catalogo = { righe: null, promessa: null };
    function leggiCatalogo() {
        if (catalogo.righe) return Promise.resolve(catalogo.righe);
        if (catalogo.promessa) return catalogo.promessa;
        var api = API(), k = chiavi().infomaniak, pid = productId();
        if (!api || !api.listInfomaniakModels || !k || !pid) return Promise.resolve(null);
        catalogo.promessa = Promise.resolve(api.listInfomaniakModels({ apiKey: k, productId: pid }))
            .then(function (rows) { catalogo.righe = Array.isArray(rows) ? rows : null; catalogo.promessa = null; return catalogo.righe; })
            .catch(function () { catalogo.promessa = null; return null; });
        return catalogo.promessa;
    }
    function tendina() { var M = window.MappAIVisioneModello; return (M && typeof M.modello === 'function' && M.modello()) || CORE().MODELLI.TENDINA_PREDEFINITO; }
    function modelli(tipo) {
        return leggiCatalogo().then(function (righe) { return CORE().modelloPer(tipo, fornitore(), chiavi(), { righe: righe, tendina: tendina() }); });
    }
    var FORMULE_PREDEFINITO = {
        it: 'In questa immagine ci sono formule matematiche (disequazioni, equazioni, frazioni, intervalli). Riscrivi ogni formula in una riga sola, nell\'ordine, col numero dell\'esercizio in testa: le frazioni come (a)/(b), gli intervalli con le parentesi giuste, la soluzione dopo « → » se c\'è. Riscrivi solo le formule che vedi nell\'immagine, senza spiegazioni.',
        en: 'This image contains mathematical formulas (inequalities, equations, fractions, intervals). Rewrite each formula on a single line, in order, with the exercise number first: fractions as (a)/(b), intervals with the right brackets, the solution after " → " if present. Rewrite only the formulas you see in the image, with no explanations.'
    };
    function testoConsole(tipo) {
        var L = lingua().toUpperCase(), cfg = window.systemPromptsConfig || {};
        var chiave = 'LETTURA_IMMAGINI_' + tipo + '_' + L;
        if (typeof cfg[chiave] === 'string') return cfg[chiave];
        if (tipo === 'FORMULE') return FORMULE_PREDEFINITO[lingua()];
        return '';
    }
    function promptDi(tipo, opz) { return CORE().prompt(tipo, testoConsole(tipo), { lingua: lingua(), testoTipografico: opz && opz.testoTipografico }); }

    /* ── le chiamate ai modelli: al più 3 in volo, 60 s di attesa, il Registro consumi ── */
    var inVolo = 0, coda = [];
    var RITENTI_429 = [4000, 10000, 20000];     // attese prima di ritentare un 429 (le prove le accorciano via `_RITENTI_429`)
    function prendi() { return new Promise(function (res) { var via = function () { inVolo++; res(); }; if (inVolo < CORE().SOGLIE.CHIAMATE_IN_VOLO) via(); else coda.push(via); }); }
    function lascia() { inVolo--; var next = coda.shift(); if (next) next(); }
    function conAttesa(p, ms) {
        return new Promise(function (res, rej) {
            var tm = setTimeout(function () { rej(new Error('attesa oltre ' + Math.round(ms / 1000) + ' s')); }, ms);
            p.then(function (v) { clearTimeout(tm); res(v); }, function (e) { clearTimeout(tm); rej(e); });
        });
    }
    function registra(provider, modello, usage, stop, tetto) {
        var U = window.MappAIUsage;
        var inT = usage && usage.promptTokenCount, outT = usage && usage.candidatesTokenCount;
        var noto = [inT, outT].every(function (n) { return typeof n === 'number' && isFinite(n) && n >= 0; });
        var riga = { provider: provider, model: modello, usageKnown: noto, inTok: noto ? inT : null, outTok: noto ? outT : null, thoughts: 0,
            n: null, stop: stop || null, tetto: tetto, ctx: { cat: 'pipeline', sub: 'figure' } };
        try {
            var s = _st();
            if (s) { var u = s.generationUsage || (s.generationUsage = { promptTokens: 0, candidateTokens: 0, totalTokens: 0 }); if (noto) { u.promptTokens += inT; u.candidateTokens += outT; u.totalTokens += (usage.totalTokenCount || inT + outT); } (u.costRecords || (u.costRecords = [])).push(riga); }
            if (U && U.record) U.record(riga);
            if (window.updateCostDisplay) window.updateCostDisplay();
        } catch (e) { /* il registro non ferma la lettura */ }
    }
    function senzaSegreti(msg, segreti) { var out = String(msg || 'rete'); segreti.filter(Boolean).forEach(function (x) { out = out.split(x).join('«omesso»'); }); return out; }
    /* `ritaglio`: { dataUrl, mime }; `modello`: id; `provider`: 'infomaniak' | 'google'. → { testo, ms, stop } o lancia. */
    function chiama(provider, modello, ritaglio, testoPrompt) {
        var C = CORE(), api = API(), P = C.payloadLettura({ mime: ritaglio.mime });
        var payload = { contents: [{ parts: [{ inlineData: { mimeType: ritaglio.mime, data: ritaglio.dataUrl.slice(ritaglio.dataUrl.indexOf(',') + 1) } }, { text: testoPrompt }] }], generationConfig: P.generationConfig };
        var k = chiavi(), t0 = adesso();
        if (!api) return Promise.reject(new Error('rete'));
        /* Il 429 di Infomaniak («Rate limit exceeded») si ritenta con attesa, tenendo il posto fra le 3 in volo
           (così il ritmo cala da sé): al gate 3 (19/10) 73 ritagli del GEO ne hanno lasciati 45 «non letti».
           `fetchModelAPI` ha il suo backoff; il modulo non ci passa e lo fa qui. */
        var esegui = function () {
            var p;
            if (provider === 'google') {
                if (!k.google) throw new Error('chiave Google assente');
                var gc = {}; Object.keys(P.generationConfig).forEach(function (x) { if (x[0] !== '_') gc[x] = P.generationConfig[x]; });
                p = Promise.resolve(api.generateGemini({ apiKey: k.google, payload: { contents: payload.contents, generationConfig: gc }, model: modello })).then(function (raw) {
                    var c = raw && raw.candidates && raw.candidates[0];
                    var testo = c && c.content && c.content.parts && c.content.parts.map(function (x) { return x.text || ''; }).join('') || '';
                    registra('google', modello, raw && raw.usageMetadata, c && c.finishReason, P.generationConfig.maxOutputTokens);
                    return { testo: testo, stop: c && c.finishReason || null };
                });
            } else {
                var B = PONTE();
                if (!B || !k.infomaniak || !productId()) throw new Error('provider infomaniak: mancano token o product id');
                var tradotto = B.translatePayload(payload, modello, { immagini: P.immagini, penalita: P.penalita });
                p = Promise.resolve(api.generateInfomaniak({ apiKey: k.infomaniak, payload: tradotto, productId: productId() })).then(function (raw) {
                    var resp = B.translateResponse(raw || {});
                    if (resp.error) throw new Error(resp.error);
                    var c = resp.candidates[0];
                    registra('infomaniak', (raw && raw.model) || modello, resp.usageMetadata, c.finishReason, P.generationConfig.maxOutputTokens);
                    return { testo: c.content.parts[0].text || '', stop: c.finishReason || null };
                });
            }
            return conAttesa(p, P.attesaMs);
        };
        var giro = function (n) {
            return Promise.resolve().then(esegui).catch(function (e) {
                var msg = String(e && e.message || e);
                if (n < RITENTI_429.length && /\b429\b|rate.?limit/i.test(msg)) {
                    return new Promise(function (r) { setTimeout(r, RITENTI_429[n]); }).then(function () { return giro(n + 1); });
                }
                throw e;
            });
        };
        return prendi().then(function () {
            return giro(0).then(function (r) { lascia(); r.ms = Math.round(adesso() - t0); return r; }, function (e) { lascia(); throw new Error(senzaSegreti(e && e.message || e, [k.infomaniak, k.google, productId()])); });
        });
    }

    /* ── il dossier (.figure.json): in memoria per la seduta, nel deposito per impronta, copia nel vault ─────
       Packet 0114 (ADR 0024 revisione 1, punto 1). HOME fa `location.reload()` e la memoria muore: le letture si
       depositano in «MappAI - file»/Sistema/Figure/<impronta>.figure.json appena ci sono, coi canali che ci sono
       (`filesRootGet`, `saveVaultFile`/`readVaultFile` con `vaultPath` = la radice; niente IPC nuovo). Il vault tiene
       la copia in Fonti/ (ADR 0011). Si cerca: memoria → deposito e vault, riconciliati per voce (vince la più
       recente, `dossier.unisci` del core) → nuovo. Senza radice (reader, prove), senza FilesCore o con le figure
       spente il deposito non c'è e tutto va come prima. */
    var dossierCache = {};
    var deposito = { radice: undefined, promessa: null, indice: null, coda: {} };
    function FC() { return window.MappAIFilesCore || null; }
    function nomeDossier(nome) { return 'Fonti/' + String(nome || 'fonte').replace(/\.pdf$/i, '') + '.figure.json'; }
    function daBase64(b64) { return typeof atob === 'function' ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, 'base64').toString('utf8'); }
    function leggiJson(vaultPath, relPath) {
        var api = API();
        if (!vaultPath || !relPath || !api || !api.readVaultFile) return Promise.resolve(null);
        return Promise.resolve(api.readVaultFile({ vaultPath: vaultPath, relPath: relPath }))
            .then(function (r) { return r && r.ok && r.base64 ? JSON.parse(daBase64(r.base64)) : null; })
            .catch(function () { return null; });   // un file rotto o assente: come se non ci fosse
    }
    function valido(d, impronta) { return !!d && d.versione === 1 && Array.isArray(d.ritagli) && (impronta ? d.impronta === impronta : !!d.impronta) ? d : null; }
    /* La radice di «MappAI - file», una volta per seduta: come `mappaiRootDir()` del main, `rootDir` coi file organizzati,
       altrimenti Documenti + la cartella madre. */
    function radice() {
        if (!attiva('crea') || !FC()) return Promise.resolve(null);
        if (deposito.radice !== undefined) return Promise.resolve(deposito.radice);
        if (deposito.promessa) return deposito.promessa;
        var api = API();
        if (!api || typeof api.filesRootGet !== 'function') { deposito.radice = null; return Promise.resolve(null); }
        deposito.promessa = Promise.resolve(api.filesRootGet()).then(function (st) {
            var r = typeof st === 'string' ? st : (st && (st.rootDir || (st.documentsDir ? String(st.documentsDir).replace(/[\\/]+$/, '') + '/' + FC().ROOT_FOLDER : null)));
            deposito.radice = r || null;
            return deposito.radice;
        }, function () { deposito.radice = null; return null; }).then(function (r) { deposito.promessa = null; return r; });
        return deposito.promessa;
    }
    function nomeDeposito(impronta) { return FC().depositoFigure(String(impronta) + '.figure.json'); }
    function leggiDeposito(impronta) {
        if (!impronta) return Promise.resolve(null);
        return radice().then(function (r) { return r ? leggiJson(r, nomeDeposito(impronta)) : null; }).then(function (d) { return valido(d, impronta); });
    }
    /* l'indice nome → impronta, per ELABORA che cerca per nome del PDF */
    function leggiIndice() {
        if (deposito.indice) return Promise.resolve(deposito.indice);
        return radice().then(function (r) { return r ? leggiJson(r, FC().depositoFigure('indice.json')) : null; })
            .then(function (x) { deposito.indice = (x && typeof x === 'object' && !Array.isArray(x)) ? x : {}; return deposito.indice; });
    }
    /* Scrive il deposito di un'impronta; le scritture della stessa impronta vanno in fila (3 ritagli in volo). */
    function scriviDeposito(impronta) {
        var prima = deposito.coda[impronta] || Promise.resolve();
        var p = prima.then(function () { return radice(); }).then(function (r) {
            var api = API(), d = dossierCache[impronta];
            if (!r || !d || !api || !api.saveVaultFile) return { ok: false, error: 'senza deposito' };
            CORE().dossier.riassumi(d);
            return Promise.resolve(api.saveVaultFile({ vaultPath: r, relPath: nomeDeposito(impronta), text: JSON.stringify(d, null, 1) })).then(function (res) {
                var nome = String(d.file || '').replace(/^Fonti\//, '');
                return leggiIndice().then(function (ind) {
                    if (!nome || ind[nome] === impronta) return res;
                    ind[nome] = impronta;
                    return Promise.resolve(api.saveVaultFile({ vaultPath: r, relPath: FC().depositoFigure('indice.json'), text: JSON.stringify(ind, null, 1) })).then(function () { return res; });
                });
            });
        }).then(function (res) { return res && res.ok ? { ok: true } : { ok: false, error: (res && res.error) || 'non salvato' }; },
            function (e) { return { ok: false, error: e && e.message || 'non salvato' }; });
        deposito.coda[impronta] = p;
        return p;
    }
    function attendiDeposito(impronta) { return deposito.coda[impronta] || Promise.resolve(); }
    /* Deposito (A) e vault (B) riconciliati; il più recente si ricopia nell'altro. `vaultPath` può mancare (mappa nuova). */
    function riconcilia(dep, vau, vaultPath) {
        var u = CORE().dossier.unisci(dep, vau), d = u.dossier;
        if (!d) return Promise.resolve(null);
        if (dossierCache[d.impronta]) return Promise.resolve(dossierCache[d.impronta]);   // la memoria della seduta è la copia di lavoro
        dossierCache[d.impronta] = d;
        var scritture = [];
        if (u.cambiaA) scritture.push(scriviDeposito(d.impronta));
        if (u.cambiaB && vaultPath) scritture.push(scriviVault(vaultPath, d.impronta));
        return Promise.all(scritture).then(function () { return d; });
    }
    function leggiDossier(prova, opz) {
        var C = CORE(), impr = prova.impronta || '';
        if (dossierCache[impr]) return Promise.resolve(dossierCache[impr]);
        var nuovo = function () { var d = C.dossier.nuovo({ impronta: impr, file: 'Fonti/' + String(opz.nome || prova.nome || 'fonte.pdf'), pagine: prova.numPagine }); dossierCache[impr] = d; return d; };
        var nelVault = opz.vaultPath ? leggiJson(opz.vaultPath, nomeDossier(opz.nome || prova.nome)).then(function (d) { return valido(d, impr); }) : Promise.resolve(null);
        return Promise.all([leggiDeposito(impr), nelVault]).then(function (r) {
            return riconcilia(r[0], r[1], opz.vaultPath).then(function (d) { return d || nuovo(); });
        }).catch(nuovo);
    }
    function scriviVault(vaultPath, impronta) {
        var api = API(), d = dossierCache[impronta];
        if (!d || !vaultPath || !api || !api.saveVaultFile) return Promise.resolve({ ok: false, error: 'niente da scrivere' });
        CORE().dossier.riassumi(d);
        var relPath = nomeDossier((d.file || '').replace(/^Fonti\//, ''));
        return Promise.resolve(api.saveVaultFile({ vaultPath: vaultPath, relPath: relPath, text: JSON.stringify(d, null, 1) }))
            .then(function (res) { return res && res.ok ? { ok: true, relPath: relPath } : { ok: false, error: (res && res.error) || 'non salvato' }; });
    }
    /* la copia nel vault (flushSourcesToVault, i gesti di ELABORA) e, con lei, il deposito */
    function scriviDossier(vaultPath, impronta) {
        return scriviVault(vaultPath, impronta).then(function (res) { return scriviDeposito(impronta).then(function () { return res; }); });
    }

    /* ── LE DECISIONI LOCALI (prova a secco, parte seconda): ritagli, Tesseract, tinte, smista. Zero chiamate. ── */
    function decidi(prova) {
        var C = CORE(), pdf = prova._pdf;
        var lavori = [];
        prova.pagine.forEach(function (p) {
            if (p.stato !== 'ritagli' && p.stato !== 'testo-immagini') return;
            p.ritagli.forEach(function (rit) { lavori.push({ p: p, rit: rit }); });
        });
        if (prova.decisioni) return Promise.resolve(prova);
        var catena = Promise.resolve();
        lavori.forEach(function (l) {
            catena = catena.then(function () {
                return pdf.getPage(l.p.numero).then(function (page) { return ritaglia(page, l.rit.rett, l.rit.ppi); }).then(function (img) {
                    l.rit.immagine = img;
                    l.rit.tintePiatte = tintePiatte(img.canvas);
                    return leggiOcr(img.dataUrl).then(function (testo) {
                        l.rit.testoTesseract = testo;
                        l.rit.decisione = C.smista({ formule: false, tesseractCaricato: testo != null, testoTesseract: testo, testoTipografico: l.p.testo, tintePiatte: l.rit.tintePiatte });
                        l.rit.chiamate = l.rit.decisione.chiamate; l.rit.paroleTesseract = l.rit.decisione.paroleTesseract;
                        delete img.canvas;
                    });
                });
            });
        });
        return catena.then(function () {
            prova.pagine.forEach(function (p) {
                if (!p.ritagli.length) return;
                var tetto = C.applicaTetto(p.ritagli);
                p.oltreTetto = tetto.oltreTetto; p.paginaGialla = tetto.paginaGialla;
                var fuori = {}; tetto.oltreTetto.forEach(function (r) { fuori[r.nome] = true; });
                p.ritagli.forEach(function (r) { if (fuori[r.nome]) { r.nonLetto = 'oltre il tetto'; r.chiamate = 0; } });
            });
            prova.decisioni = lavori.map(function (l) { return l.rit.decisione; });
            prova.formulePagine = prova.pagine.filter(function (p) { return p.formule && p.formule.regioni.length; }).length;
            return prova;
        });
    }
    function prova(sorgente, opz) { return misura(sorgente, opz).then(decidi); }

    /* ── la stima prima del clic (§5.7): core.stima coi prezzi del catalogo e di MODEL_KB ── */
    function prezzoDi(id) {
        var k = String(id || '').toLowerCase(), cat = window.MappAICatalogo;
        if (cat && typeof cat.kb === 'function') { try { var r = cat.kb(id); if (r && r.priceKnown && typeof r.inputCost === 'number') return { in: r.inputCost, out: r.outputCost || 0 }; } catch (e) { /* niente */ } }
        var KB = null; try { KB = (typeof MODEL_KB !== 'undefined') ? MODEL_KB : window.MODEL_KB; } catch (e) { KB = window.MODEL_KB; }
        if (KB) { var hit = Object.keys(KB).find(function (x) { return x.toLowerCase() === k; }); var v = hit && KB[hit]; if (v && typeof v.inputCost === 'number') return { in: v.inputCost, out: v.outputCost || 0 }; }
        return { in: 0, out: 0 };
    }
    function stima(prova, opz) {
        var C = CORE();
        return modelli('FIGURA').then(function (m) {
            var dec = (prova.decisioni || []).slice();
            for (var i = 0; i < (prova.formulePagine || 0); i++) dec.push({ caso: 1, chiamate: m.letture >= 2 ? 2 : 1, motivo: 'formule' });
            var s = C.stima(dec, { titolare: prezzoDi(m.titolare), controllo: m.controllo ? prezzoDi(m.controllo) : { in: 0, out: 0 } }, { lingua: (opz && opz.lingua) || lingua() });
            s.modelli = m; return s;
        });
    }

    /* ── LA LETTURA (§5.4-5.9): le chiamate decise dal core, l'accordo, lo stato, i marcatori ── */
    function leggiRitaglio(d, p, rit, m, opz) {
        var C = CORE(), provider = m.provider, identita = C.identita(d.impronta, p.numero, rit.rettPt);
        var vecchio = C.dossier.trova(d, identita);
        if (vecchio && !C.dossier.daRileggere(vecchio) && !opz.forza) return Promise.resolve(vecchio);
        // lotto 8, «Leggi comunque»: la decisione arriva da fuori (titolare, poi il controllo solo se legge testo) e il vecchio esito non ferma
        var dec = opz.decisione || rit.decisione || C.smista({ formule: false, tesseractCaricato: false, tintePiatte: rit.tintePiatte || 0 });
        var voce = C.dossier.ritaglio({ identita: identita, pagina: p.numero, rettPt: rit.rettPt, motivo: dec.motivo, caso: dec.caso, chiamate: 0,
            ppi: rit.ppi, qualita: rit.immagine && rit.immagine.qualita, modelli: { titolare: m.titolare, controllo: m.controllo }, data: deps.ora() });
        if (rit.nonLetto) { voce.stato = 'non letto'; voce.nota = rit.nonLetto; return Promise.resolve(voce); }
        if (!(dec.chiamate > 0) || m.locale) { if (m.locale && dec.chiamate > 0) { voce.stato = 'non letto'; voce.nota = 'senza chiave'; } return Promise.resolve(voce); }
        var testoPrompt = promptDi('FIGURA'), img = rit.immagine;
        var letture = { titolare: null, controllo: null }, errori = [];
        var unaChiamata = function (ruolo, modello) {
            if (opz.annullato && opz.annullato()) return Promise.resolve(null);
            return chiama(provider, modello, img, testoPrompt).then(function (r) { letture[ruolo] = r; return r; }, function (e) { errori.push(ruolo + ': ' + (e && e.message || e)); return null; });
        };
        var giro;
        if (dec.insieme && m.controllo) giro = Promise.all([unaChiamata('titolare', m.titolare), unaChiamata('controllo', m.controllo)]);
        else giro = unaChiamata('titolare', m.titolare).then(function (r) {
            if (!r || !m.controllo || m.letture < 2) return null;
            var dopo = C.dopoTitolare(dec, C.lettore(r.testo));
            voce.caso = dopo.caso; voce.motivo = dopo.motivo;
            return dopo.controllo ? unaChiamata('controllo', m.controllo) : null;
        });
        return giro.then(function () {
            var n = (letture.titolare ? 1 : 0) + (letture.controllo ? 1 : 0);
            voce.chiamate = n;
            voce.letture = { titolare: letture.titolare ? letture.titolare.testo : null, controllo: letture.controllo ? letture.controllo.testo : null };
            if (errori.length) voce.nota = errori.join(' | ');
            if (!letture.titolare && !letture.controllo) { voce.stato = 'non letto'; return voce; }
            var pulita = function (raw) {
                var L = C.lettore(raw);
                if (L.nessunTesto) return L;
                var pul = C.pulisci(L.righe.join('\n'), p.testo);
                return Object.assign({}, L, { righe: pul.righe, testo: pul.righe.join('\n'), svuotata: pul.righe.length === 0, tolte: pul.tolte });
            };
            var T = letture.titolare ? pulita(letture.titolare.testo) : null;
            var K = letture.controllo ? pulita(letture.controllo.testo) : null;
            if (T && T.nessunTesto && (!K || K.nessunTesto)) { voce.stato = null; if (!/nessun testo/.test(voce.motivo || '')) voce.motivo = (voce.motivo || '') + ', nessun testo'; voce.tipo = T.tipo; return voce; }
            if ((!T || T.svuotata) && (!K || K.svuotata)) { voce.stato = null; voce.motivo = (voce.motivo || '') + ', già nel tipografico'; voce.tipo = (T || K).tipo; return voce; }
            voce.tipo = T ? T.tipo : (K ? K.tipo : null);
            var acc = (T && K) ? C.accordo(T, K) : null;
            var st = C.stato({ accordo: acc, letture: n, provider: provider, titolare: T, controllo: K, paroleTesseract: rit.paroleTesseract || 0, sempreGiallo: m.sempreGiallo });
            voce.stato = st.stato; voce.righe = st.righe || (acc ? acc.righe : []);
            voce.gialle = (voce.righe || []).filter(function (r) { return !r.verde; }).map(function (r) { return r.testo; });
            voce.forseManca = acc ? acc.forseManca : [];
            voce.motivi = st.motivi || [];
            return voce;
        });
    }
    function leggiFormule(d, p, m, opz) {
        var C = CORE(), pdf = opz._pdf, provider = m.provider;
        var regione = p.formule.regionePagina || p.formule.regioni[0];
        var rett = { x: regione.x, y: regione.y, w: regione.w, h: regione.h };
        var identita = C.identita(d.impronta, p.numero, [rett.x, rett.y, rett.w, rett.h]);
        var vecchio = C.dossier.trova(d, identita);
        if (vecchio && !C.dossier.daRileggere(vecchio)) return Promise.resolve(vecchio);
        var voce = C.dossier.ritaglio({ identita: identita, pagina: p.numero, rettPt: [r1(rett.x), r1(rett.y), r1(rett.w), r1(rett.h)], tipo: 'FORMULE', motivo: 'formule', caso: 1, chiamate: 0, modelli: { titolare: m.titolare, controllo: m.controllo }, ppi: [PPI_FORMULE, PPI_FORMULE], data: deps.ora() });
        if (m.locale) { voce.stato = 'non letto'; voce.nota = 'senza chiave'; return Promise.resolve(voce); }
        var indici = C.righeNellaRegione(p.righe, rett);
        var testoTipografico = indici.map(function (i) { return p.righe[i].testo; }).join('\n');
        var testoPrompt = promptDi('FORMULE', { testoTipografico: testoTipografico });
        return pdf.getPage(p.numero).then(function (page) { return ritaglia(page, rett, [PPI_FORMULE, PPI_FORMULE]); }).then(function (img) {
            delete img.canvas;
            voce.qualita = img.qualita;
            var una = function (modello) { return chiama(provider, modello, img, testoPrompt).then(function (r) { return r; }, function (e) { voce.nota = (voce.nota ? voce.nota + ' | ' : '') + (e && e.message || e); return null; }); };
            return Promise.all([una(m.titolare), m.controllo && m.letture >= 2 ? una(m.controllo) : Promise.resolve(null)]);
        }).then(function (r) {
            var T = r[0], K = r[1], n = (T ? 1 : 0) + (K ? 1 : 0);
            voce.chiamate = n; voce.letture = { titolare: T ? T.testo : null, controllo: K ? K.testo : null };
            if (!T && !K) { voce.stato = 'non letto'; return voce; }
            var LT = T ? C.lettore(T.testo) : null, LK = K ? C.lettore(K.testo) : null;
            var acc = (LT && LK) ? C.accordo(LT, LK, { formule: true }) : null;
            var st = C.stato({ accordo: acc, letture: n, provider: provider, titolare: LT, controllo: LK, formule: true, sempreGiallo: m.sempreGiallo });
            voce.stato = st.stato; voce.formule = C.lettoreFormule((T || K).testo);
            voce.gialle = acc ? acc.righe.filter(function (x) { return !x.verde; }).map(function (x) { return x.testo; }) : []; voce.forseManca = acc ? acc.forseManca : [];
            return voce;
        });
    }
    function leggiScansione(d, p, m, opz) {
        var C = CORE(), pdf = opz._pdf, L = lingua();
        var identita = C.identita(d.impronta, p.numero, [0, 0, p.larghezza, p.altezza]);
        var vecchio = C.dossier.trova(d, identita);
        var conGoogle = opz.google === true && !!chiavi().google;   // mai da solo, mai col token Infomaniak (ADR §5.8)
        // lotto 8: «Rileggi con Google» (`forza`); 0114 lotto 4: il «Sì» dell'avviso dopo un «No» rilegge le pagine di Tesseract
        if (vecchio && !C.dossier.daRileggere(vecchio, { google: conGoogle }) && !opz.forza) return Promise.resolve(vecchio);
        var rett = { x: 0, y: 0, w: p.larghezza, h: p.altezza };
        var voce = C.dossier.ritaglio({ identita: identita, pagina: p.numero, rettPt: [0, 0, r1(p.larghezza), r1(p.altezza)], tipo: 'SCANSIONE', motivo: 'scansione', caso: null, chiamate: 0, ppi: [PPI_SCANSIONE, PPI_SCANSIONE], data: deps.ora() });
        return pdf.getPage(p.numero).then(function (page) { return ritaglia(page, rett, [PPI_SCANSIONE, PPI_SCANSIONE]); }).then(function (img) {
            delete img.canvas;
            if (conGoogle) {
                voce.modelli = { titolare: C.MODELLI.GOOGLE, controllo: null };
                return chiama('google', C.MODELLI.GOOGLE, img, promptDi('SCANSIONE')).then(function (r) {
                    voce.chiamate = 1; voce.letture = { titolare: r.testo, controllo: null };
                    var R0 = C.statoR0('scansione', { google: true });
                    voce.stato = R0.stato; voce.nota = R0.nota || null;
                    voce.righe = C.lettore(r.testo).righe.map(function (x) { return { testo: x, verde: false }; });
                    voce.gialle = voce.righe.map(function (x) { return x.testo; });
                    return voce;
                }, function (e) { voce.stato = 'non letto'; voce.nota = e && e.message || 'rete'; return voce; });
            }
            // senza Google: la strada locale, rosso «parziale», non entra (§5.9)
            return leggiOcr(img.dataUrl).then(function (testo) {
                var R0 = C.statoR0('scansione', { google: false });
                voce.modelli = { titolare: 'tesseract', controllo: null };
                voce.letture = { titolare: testo || '', controllo: null }; voce.stato = R0.stato; voce.nota = R0.nota;
                return voce;
            });
        });
    }
    function leggiTestoImmagini(d, p, opz) {
        var C = CORE(), pdf = opz._pdf;
        var testi = [];
        var catena = Promise.resolve();
        p.blocchi.forEach(function (b) {
            catena = catena.then(function () {
                return pdf.getPage(p.numero).then(function (page) { return ritaglia(page, { x: b.x, y: b.y, w: b.w, h: b.h }, [PPI_FORMULE, PPI_FORMULE]); })
                    .then(function (img) { delete img.canvas; return leggiOcr(img.dataUrl); }).then(function (testo) { testi.push(testo || ''); });
            });
        });
        return catena.then(function () {
            var R0 = C.statoR0('testo-immagini', {});
            var voce = C.dossier.ritaglio({ identita: C.identita(d.impronta, p.numero, [0, 0, r1(p.larghezza), r1(p.altezza)]), pagina: p.numero, rettPt: [0, 0, r1(p.larghezza), r1(p.altezza)],
                tipo: 'TESTO-IMMAGINI', motivo: 'testo a immagini', caso: null, chiamate: 0, modelli: { titolare: 'tesseract', controllo: null }, stato: R0.stato, nota: R0.nota, letture: { titolare: testi.join('\n\n'), controllo: null }, data: deps.ora() });
            voce.blocchi = testi;
            return voce;
        });
    }

    /* `prova`: l'esito di `prova()`; `opz`: { origine, vaultPath, nome, google (true|false|null), onProgresso(k, N), annullato() }.
       → { pagine: [{ numero, blocco, testoSostitutivo }], dossier, riassunto, avvisi, annullato } */
    function leggi(prova, opz) {
        opz = opz || {};
        var C = CORE();
        if (!C) return Promise.reject(new Error('figure: manca il core'));
        if (!attiva(opz.origine)) return Promise.resolve({ pagine: [], dossier: null, riassunto: null, avvisi: {}, spento: true });
        var L = lingua(), uscita = { pagine: [], riassunto: null, avvisi: { scansioni: prova.pdfScansione ? prova.pagineScansione : 0 }, annullato: false };
        var fatti = 0, totale = 0;
        prova.pagine.forEach(function (p) {
            if (p.stato === 'ritagli' || p.stato === 'testo-immagini') totale += p.ritagli.filter(function (r) { return r.chiamate > 0; }).length;
            if (p.formule && p.formule.regioni.length) totale += 1;
            if (p.stato === 'scansione') totale += 1;
        });
        var avanza = function () { fatti++; if (opz.onProgresso) { try { opz.onProgresso(fatti, totale); } catch (e) { /* niente */ } } };
        var fermo = function () { return !!(opz.annullato && opz.annullato()); };
        if (totale && opz.onProgresso) { try { opz.onProgresso(0, totale); } catch (e) { /* niente */ } }
        // il Registro consumi (lotto 5): il contesto `pipeline/figure` per tutta la lettura, poi quello di prima
        var U = window.MappAIUsage, ctxPrima = null;
        if (U && typeof U.setContext === 'function') { try { ctxPrima = typeof U.current === 'function' ? U.current() : null; U.setContext('pipeline', 'figure'); } catch (e) { /* niente */ } }
        var rimetti = function () { if (ctxPrima && U && typeof U.setContext === 'function') { try { U.setContext(ctxPrima.cat, ctxPrima.sub); } catch (e) { /* niente */ } } };
        return Promise.all([leggiDossier(prova, opz), modelli('FIGURA')]).then(function (r) {
            var d = r[0], m = r[1];
            var googlePrima = d.google;
            if (prova.pdfScansione) d.google = opz.google === true ? 'si' : (opz.google === false ? 'no' : d.google);
            if (d.google !== googlePrima) scriviDeposito(d.impronta);
            /* 0114, D3: ogni voce nuova entra nel dossier e nel deposito appena c'è (ciò che è pagato sopravvive a HOME e
               a un'app chiusa a metà); una voce già lì (stessa voce restituita da leggiRitaglio) non si riscrive. */
            var depositate = 0;
            var deposita = function (v) {
                if (!v || !v.identita) return v;
                var k = d.ritagli.findIndex(function (x) { return x.identita === v.identita; });
                if (k >= 0 && d.ritagli[k] === v) return v;
                if (k >= 0) d.ritagli[k] = v; else d.ritagli.push(v);
                depositate++;
                scriviDeposito(d.impronta);
                return v;
            };
            var o2 = Object.assign({}, opz, { _pdf: prova._pdf });
            var catena = Promise.resolve();
            prova.pagine.forEach(function (p) {
                catena = catena.then(function () {
                    if (fermo()) { uscita.annullato = true; return; }
                    var voci = [];
                    var passo = Promise.resolve();
                    if (p.stato === 'ritagli' || p.stato === 'testo-immagini') {
                        // i ritagli con chiamate partono insieme, al più 3 in volo (`prendi`/`lascia`)
                        passo = passo.then(function () {
                            return Promise.all(p.ritagli.map(function (rit) {
                                return leggiRitaglio(d, p, rit, m, o2).then(function (v) { if (rit.chiamate > 0 && !rit.nonLetto) avanza(); return deposita(v); });
                            })).then(function (vs) { vs.forEach(function (v) { voci.push(v); }); });   // nell'ordine dei ritagli, non di arrivo
                        });
                    }
                    if (p.stato === 'testo-immagini') passo = passo.then(function () { return leggiTestoImmagini(d, p, o2).then(function (v) { voci.push(deposita(v)); }); });
                    if (p.formule && p.formule.regioni.length) passo = passo.then(function () { return leggiFormule(d, p, m, o2).then(function (v) { avanza(); voci.push(deposita(v)); }); });
                    if (p.stato === 'scansione') passo = passo.then(function () { return leggiScansione(d, p, m, o2).then(function (v) { avanza(); voci.push(deposita(v)); }); });
                    return passo.then(function () {
                        // le voci della pagina nell'ordine dei ritagli (deposita le ha messe nell'ordine di arrivo), al posto della prima
                        var ids = {}; voci.forEach(function (v) { if (v && v.identita) ids[v.identita] = true; });
                        var primo = d.ritagli.findIndex(function (x) { return ids[x.identita]; });
                        var altri = d.ritagli.filter(function (x) { return !ids[x.identita]; });
                        var at = primo < 0 ? altri.length : d.ritagli.slice(0, primo).filter(function (x) { return !ids[x.identita]; }).length;
                        d.ritagli = altri.slice(0, at).concat(voci.filter(function (v) { return v && v.identita; }), altri.slice(at));
                        uscita.pagine.push(bloccoDiPagina(C, p, voci, L));
                    });
                });
            });
            // a fine giro una scrittura ancora, con le voci nell'ordine dei ritagli (il riordino di fine pagina)
            return catena.then(function () { return depositate ? scriviDeposito(d.impronta) : attendiDeposito(d.impronta); }).then(function () {
                var ria = C.dossier.riassumi(d);
                uscita.dossier = d;
                uscita.riassunto = { lette: ria.stati.verdi + ria.stati.gialli, verdi: ria.stati.verdi, gialle: ria.stati.gialli, rosse: ria.stati.rossi, nonLette: ria.stati.nonLetti, saltati: ria.saltati, chiamate: ria.chiamate, modelli: m };
                uscita.toast = toastFinale(uscita.riassunto);
                if (ria.stati.nonLetti && !uscita.annullato) { toast(uscita.toast, 'warning'); uscita.toastMostrato = true; }
                // «Salta le figure» (§5.7): si prosegue col solo testo tipografico; i ritagli pagati restano nel dossier
                if (uscita.annullato) uscita.pagine = [];
                // 0114 lotto 4 (D5): un PDF scansione rimasto senza testo per la mappa; l'avviso lo dà `fineCrea`
                uscita.avvisi.scansioneNonLetta = C.scansioneNonLetta(prova, uscita);
                rimetti();
                return uscita;
            });
        }).catch(function (e) { rimetti(); throw e; });
    }
    /* Che cosa di una voce entra nel blocco della pagina (ADR §5.6, lotto 8): il testo corretto dal docente vince su tutto ed
       entra senza il segno (non è «letto da un'immagine, incerto»: l'ha scritto lui); un rosso che il docente ha confermato in
       ELABORA entra con la lettura che c'è (le righe dell'accordo, altrimenti il titolare, altrimenti il controllo), senza il
       segno; per il resto lo stato e le righe della lettura, e marcatori.figure lascia fuori rosso e non letto.
       Revisione 1 dell'ADR, punto 3 (packet 0114): anche un GIALLO controllato dal docente entra senza il segno, con la lettura
       che ha — figura intera (`confermato`, la data) o riga per riga (`righeConfermate`, i testi delle righe che il docente ha
       detto «va bene»: il segno resta solo sulle altre). Il verde non ha bisogno di conferma. */
    function letturaDiVoce(C, v) {
        if (v.testoCorretto) return { stato: 'verde', righe: [{ testo: v.testoCorretto, verde: true }] };
        var righe = v.righe;
        if ((!righe || !righe.length) && v.letture) {
            var grezzo = v.letture.titolare || v.letture.controllo || '';
            if (grezzo) righe = C.lettore(grezzo).righe.map(function (x) { return { testo: x, verde: v.stato === 'verde' }; });
        }
        if (!righe) return null;
        var tutte = function () { return righe.map(function (x) { return { testo: x.testo, verde: true }; }); };
        if ((v.stato === 'rosso' || v.stato === 'giallo') && v.confermato && righe.length) return { stato: 'verde', righe: tutte() };
        if (v.stato === 'giallo' && v.righeConfermate && v.righeConfermate.length) {
            var ok = {};
            v.righeConfermate.forEach(function (t) { ok[C.compatta(t)] = true; });
            return { stato: 'giallo', righe: righe.map(function (x) { return { testo: x.testo, verde: x.verde !== false || !!ok[C.compatta(x.testo)] }; }) };
        }
        return { stato: v.stato, righe: righe };
    }
    function bloccoDiPagina(C, p, voci, L) {
        var letture = voci.filter(function (v) { return v.tipo !== 'FORMULE' && v.tipo !== 'TESTO-IMMAGINI' && v.tipo !== 'SCANSIONE'; })
            .map(function (v) { return letturaDiVoce(C, v); }).filter(Boolean);
        voci.filter(function (v) { return v.tipo === 'SCANSIONE'; }).forEach(function (v) { var l = letturaDiVoce(C, v); if (l) letture.push(l); });
        var blocco = C.marcatori.figure(p.numero, letture, { lingua: L });
        var ti = voci.find(function (v) { return v.tipo === 'TESTO-IMMAGINI'; });
        var bTI = ti ? C.marcatori.testoImmagini(p.numero, ti.blocchi || [], { lingua: L }) : '';
        var testoSostitutivo = null, bF = '';
        var f = voci.find(function (v) { return v.tipo === 'FORMULE' && v.formule; });
        if (f && p.formule && p.formule.regioni.length) {
            var regione = p.formule.regionePagina || p.formule.regioni[0];
            var indici = C.righeNellaRegione(p.righe, regione);
            var inn = C.innesta({ righe: p.righe.map(function (x) { return x.testo; }), indiciRegione: indici, formule: f.formule, stato: f.stato, pagina: p.numero, lingua: L });
            if (f.stato === 'verde' && (inn.inserite || inn.tolte)) testoSostitutivo = inn.righe.join(' ');
            else if (f.stato === 'giallo') bF = C.marcatori.formule(p.numero, f.formule, { lingua: L });
        }
        var tutto = [blocco, bTI, bF].filter(Boolean).join(' ');
        return { numero: p.numero, blocco: tutto, testoSostitutivo: testoSostitutivo, paginaGialla: !!p.paginaGialla };
    }
    function toastFinale(r) {
        return _t('fig_toast_finale', 'Figure: {lette} lette, {gialle} da controllare, {rosse} escluse, {nonLette} non lette')
            .replace('{lette}', String(r.lette)).replace('{gialle}', String(r.gialle)).replace('{rosse}', String(r.rosse)).replace('{nonLette}', String(r.nonLette));
    }

    /* ── LOTTO 8: gli ingressi di ELABORA, «Testo delle figure» (ADR §5.6-5.8) ─────────────────────────────────
       La vista della fonte legge il dossier (`trovaDossier`: in memoria per impronta o per nome, altrimenti dal
       `.figure.json` del vault) e chiama qui per i gesti del docente: «Leggi comunque» su un ritaglio saltato o
       escluso (`leggiUno`: al titolare, poi il controllo solo se legge testo — il caso 4 del core), «Rileggi con
       Google» su una pagina scansione (`rileggiPagina`: solo con `google: true` E la chiave Google, mai col token
       Infomaniak), la correzione (`correggi`) e la conferma di un rosso (`conferma`). Ogni gesto aggiorna la voce
       nel dossier e, se `opz.vaultPath` c'è, riscrive il `.figure.json` (percorsi relativi). */
    function trovaDossier(opz) {
        opz = opz || {};
        var C = CORE(), api = API();
        if (opz.impronta && dossierCache[opz.impronta]) return Promise.resolve(dossierCache[opz.impronta]);
        var perNome = opz.nome ? Object.keys(dossierCache).map(function (k) { return dossierCache[k]; }).filter(function (d) { return d && d.file === 'Fonti/' + opz.nome; })[0] : null;
        if (perNome) return Promise.resolve(perNome);
        if (!C || !api) return Promise.resolve(null);
        // 0114: prima il deposito (per impronta, o per nome dall'indice), poi il vault della mappa; riconciliati
        var impr = opz.impronta ? Promise.resolve(opz.impronta) : (opz.nome ? leggiIndice().then(function (ind) { return ind[opz.nome] || null; }) : Promise.resolve(null));
        var nelVault = opz.nome && opz.vaultPath ? leggiJson(opz.vaultPath, nomeDossier(opz.nome)).then(function (d) { return valido(d); }) : Promise.resolve(null);
        return Promise.all([impr.then(leggiDeposito), nelVault]).then(function (r) {
            var dep = r[0], vau = r[1];
            if (dep && vau && dep.impronta !== vau.impronta) dep = null;   // un altro PDF con lo stesso nome: vale quello della mappa
            return riconcilia(dep, vau, opz.vaultPath);
        }).catch(function () { return null; });
    }
    function cercaNellaProva(prova, identita) {
        var C = CORE(), esito = null;
        (prova.pagine || []).forEach(function (p) {
            if (esito) return;
            (p.ritagli || []).forEach(function (rit) { if (!esito && C.identita(prova.impronta, p.numero, rit.rettPt) === identita) esito = { p: p, rit: rit }; });
            if (!esito && C.identita(prova.impronta, p.numero, [0, 0, p.larghezza, p.altezza]) === identita) esito = { p: p, rit: null };
        });
        return esito;
    }
    function sostituisciVoce(d, v) {
        var k = d.ritagli.findIndex(function (x) { return x.identita === v.identita; });
        if (k >= 0) d.ritagli[k] = v; else d.ritagli.push(v);
        CORE().dossier.riassumi(d);
    }
    /* dopo un gesto del docente: il deposito sempre (se c'è), il vault se c'è (0114) */
    function salvaSeVault(d, opz) {
        if (!opz || !opz.vaultPath) return scriviDeposito(d.impronta).then(function () { return { ok: false, error: 'senza vault' }; });
        return scriviDossier(opz.vaultPath, d.impronta).catch(function (e) { return { ok: false, error: e && e.message || 'non salvato' }; });
    }
    function conDecisioni(prova) { return prova.decisioni ? Promise.resolve(prova) : decidi(prova); }
    function leggiUno(prova, identita, opz) {
        opz = opz || {};
        var C = CORE();
        if (!C) return Promise.reject(new Error('figure: manca il core'));
        return conDecisioni(prova).then(function () { return Promise.all([leggiDossier(prova, opz), modelli('FIGURA')]); }).then(function (r) {
            var d = r[0], m = r[1];
            var dove = cercaNellaProva(prova, identita);
            if (!dove || !dove.rit) throw new Error('ritaglio non trovato');
            if (m.locale) throw new Error('senza chiave');
            var vecchia = C.dossier.trova(d, identita);
            var base = dove.rit.decisione || C.smista({ formule: false, tesseractCaricato: false, tintePiatte: dove.rit.tintePiatte || 0 });
            // il caso 4 del core: una chiamata al titolare, il controllo solo se legge testo (ADR §5.4); il motivo ricorda il gesto
            var dec = Object.assign({}, base, { caso: 4, chiamate: 1, insieme: false, controlloDopo: true, motivo: String(base.motivo || '').replace(/,.*$/, '') });
            var rit = Object.assign({}, dove.rit, { nonLetto: null, chiamate: 1 });
            var o2 = Object.assign({}, opz, { _pdf: prova._pdf, forza: true, decisione: dec, annullato: null });
            return leggiRitaglio(d, dove.p, rit, m, o2).then(function (v) {
                if (!/su richiesta/.test(v.motivo || '')) v.motivo = (v.motivo ? v.motivo + ', ' : '') + 'su richiesta del docente';   // il motivo ricorda il gesto
                if (vecchia && vecchia.testoCorretto) v.testoCorretto = vecchia.testoCorretto;   // il testo del docente resta
                sostituisciVoce(d, v);
                return salvaSeVault(d, opz).then(function () { return v; });
            });
        });
    }
    function rileggiPagina(prova, identita, opz) {
        opz = opz || {};
        var C = CORE();
        if (!C) return Promise.reject(new Error('figure: manca il core'));
        if (opz.google !== true || !chiavi().google) return Promise.reject(new Error('serve la chiave Google'));   // mai da solo, mai col token Infomaniak (ADR §5.8)
        return Promise.all([leggiDossier(prova, opz), modelli('FIGURA')]).then(function (r) {
            var d = r[0], m = r[1];
            var dove = cercaNellaProva(prova, identita);
            if (!dove || dove.p.stato !== 'scansione') throw new Error('non è una pagina scansione');
            var vecchia = C.dossier.trova(d, identita);
            return leggiScansione(d, dove.p, m, Object.assign({}, opz, { _pdf: prova._pdf, forza: true, google: true })).then(function (v) {
                if (vecchia && vecchia.testoCorretto) v.testoCorretto = vecchia.testoCorretto;
                sostituisciVoce(d, v);
                return salvaSeVault(d, opz).then(function () { return v; });
            });
        });
    }
    function vocePer(impronta, identita) {
        var d = dossierCache[impronta], v = d && CORE().dossier.trova(d, identita);
        if (!v) return Promise.reject(new Error('ritaglio non trovato'));
        return Promise.resolve({ d: d, v: v });
    }
    function correggi(impronta, identita, testo, opz) {
        return vocePer(impronta, identita).then(function (x) {
            var t = String(testo == null ? '' : testo).trim();
            x.v.testoCorretto = t || null;
            x.v.corretto = t ? deps.ora() : null;
            x.v.toccato = deps.ora();
            CORE().dossier.riassumi(x.d);
            return salvaSeVault(x.d, opz).then(function () { return x.v; });
        });
    }
    function conferma(impronta, identita, opz) {
        return vocePer(impronta, identita).then(function (x) {
            x.v.confermato = deps.ora();
            x.v.toccato = x.v.confermato;
            CORE().dossier.riassumi(x.d);
            return salvaSeVault(x.d, opz).then(function () { return x.v; });
        });
    }
    /* 0114 lotto 3: «va bene» su UNA riga gialla (revisione 1 dell'ADR, punto 3, modalità riga per riga). Il testo entra in
       `righeConfermate` compattato e una volta sola; con `opz.togli` esce. Ogni gesto scrive `toccato` (la riconciliazione
       deposito/vault del lotto 2 legge quella data). Stesso schema di `conferma`: vocePer → campo → toccato → riassumi → salva. */
    function confermaRiga(impronta, identita, testo, opz) {
        opz = opz || {};
        return vocePer(impronta, identita).then(function (x) {
            var C = CORE(), t = C.compatta(testo);
            if (!t) throw new Error('riga vuota');
            var righe = (x.v.righeConfermate || []).filter(function (r) { return C.compatta(r) !== t; });
            if (!opz.togli) righe.push(t);
            x.v.righeConfermate = righe;
            x.v.toccato = deps.ora();
            C.dossier.riassumi(x.d);
            return salvaSeVault(x.d, opz).then(function () { return x.v; });
        });
    }

    /* ── LOTTO 5: la stima sotto #estimator-cost, il velo di CREA, la domanda Google ───────────────────────────
       I testi dell'interfaccia passano da `_t` (chiavi `fig_*` dei due dizionari, lotto 6) e seguono la lingua
       dell'interfaccia; la riga della stima la scrive il core nella lingua delle mappe. */
    function doc() { return (typeof document !== 'undefined') ? document : null; }

    /* La riga «Lettura delle figure: …» prima del clic. Somma le prove a secco delle fonti PDF di CREA (`src._figure`,
       lasciate da `handlePDFUpload`/`processSourceFile`); sta subito dopo il riquadro di `#estimator-cost`, dentro la
       scheda della stima (il bento la sposta intera). Si riscrive quando arriva una prova a secco e ogni volta che
       `updateTokenCostEstimator` riscrive il contatore (fonti tolte, fornitore cambiato): lo segue un MutationObserver,
       così `index.html` e la stima della mappa non cambiano. */
    var stimaGiro = 0, osservatore = null;
    function prezzoTesto(costo) {
        if (!(costo > 0)) return '';
        var piu = _t('fig_stima_al_piu', 'al più');
        if (fornitore() === 'infomaniak') return ' · ' + piu + ' ' + costo.toFixed(4) + ' CHF';
        var ct = costo * 100;
        return ' · ' + piu + ' ' + (ct < 0.01 ? '<0.01' : ct.toFixed(2)) + ' ¢';
    }
    function osserva(costEl) {
        if (osservatore || typeof MutationObserver !== 'function' || !costEl) return;
        var attesa = null;
        osservatore = new MutationObserver(function () { clearTimeout(attesa); attesa = setTimeout(aggiornaStima, 150); });
        try { osservatore.observe(costEl, { childList: true, characterData: true, subtree: true }); } catch (e) { osservatore = null; }
    }
    function aggiornaStima() {
        var D = doc(), mio = ++stimaGiro;
        var costEl = D && D.getElementById('estimator-cost');
        if (!costEl) return Promise.resolve(null);
        osserva(costEl);
        var togli = function () { var r = D.getElementById('figure-stima'); if (r && r.parentNode) r.parentNode.removeChild(r); return null; };
        var fonti = ((_st() || {}).sources || []).filter(function (s) { return s && s._figure && s._figure.pagine; });
        if (!attiva('crea') || !fonti.length) return Promise.resolve(togli());
        var insieme = { decisioni: [], formulePagine: 0 };
        fonti.forEach(function (s) { insieme.decisioni = insieme.decisioni.concat(s._figure.decisioni || []); insieme.formulePagine += s._figure.formulePagine || 0; });
        return stima(insieme).then(function (s) {
            if (mio !== stimaGiro) return null;                     // è arrivata una stima più nuova
            if (!s || !s.riga) return togli();
            var riga = D.getElementById('figure-stima');
            if (!riga) {
                riga = D.createElement('div');
                riga.id = 'figure-stima';
                riga.className = 'text-[13px] font-bold text-slate-500';
                /* Nel bento di CREA il riquadro di #estimator-cost è smontato (larghezza zero: gate 3, 19/10, la riga c'era
                   ma non si vedeva): allora la riga va sotto il nome del file nella scheda del documento (`#status-<id>`). */
                var box = costEl.parentNode;
                var nascosto = false;
                try { nascosto = !box || (typeof costEl.getBoundingClientRect === 'function' && costEl.getBoundingClientRect().width === 0); } catch (e) { nascosto = false; }
                var visibile = function (el) { try { return !!el && (typeof el.getBoundingClientRect !== 'function' || el.getBoundingClientRect().width > 0); } catch (e) { return !!el; } };
                /* il riquadro dei documenti del bento: dentro l'elenco posizionato (`.mn-files__box` copre il modulo), altrimenti il modulo */
                var files = nascosto ? ((typeof D.querySelector === 'function' && D.querySelector('#mn-files .mn-files__box')) || D.getElementById('mn-files')) : null;
                if (files && visibile(files) && typeof files.appendChild === 'function') {
                    riga.className = 'text-[13px] font-bold text-slate-500 mt-2';
                    files.appendChild(riga);
                } else {
                    var stato = null;
                    if (nascosto) fonti.some(function (f) { var el = D.getElementById('status-' + f.id); if (el && visibile(el)) stato = el; return !!stato; });
                    var ancora = stato || box;
                    if (!ancora || typeof ancora.insertAdjacentElement !== 'function') return null;
                    if (stato) riga.className = 'text-[13px] font-bold text-slate-500 mt-2';
                    ancora.insertAdjacentElement('afterend', riga);
                }
            }
            riga.textContent = s.riga + prezzoTesto(s.costoCHF);
            riga.title = _t('fig_stima_tetto', 'È un tetto: foto e disegni contano una lettura sola, e i doppioni non costano.');
            return s;
        }, function () { return null; });
    }

    /* La domanda per un PDF scansionato (ADR §5.8): solo con la chiave Google; «No» di serie (è il primario, e la
       finestra chiusa vale «No»); la risposta vale per quel PDF e si ricorda nel `.figure.json`. */
    function domandaGoogle(k) {
        var MM = window.MappAIModal;
        if (!MM || typeof MM.open !== 'function') return Promise.resolve(false);
        var testo = _t('fig_scansione_domanda', 'Questo PDF è una scansione ({k} pagine). Con Infomaniak lo leggo solo in parte, con un OCR locale. Leggerlo con Google, con la tua chiave? Il testo esce dalla Svizzera. Con la chiave gratuita Google può usarlo per i suoi prodotti e farlo leggere a persone. Non farlo se nel PDF ci sono lavori o nomi di allievi.').replace('{k}', String(k));
        return Promise.resolve(MM.open({
            titolo: _t('fig_scansione_titolo', 'Un PDF scansionato'), icona: 'scan-text', taglia: 's',
            sezioni: [{ testo: testo }],
            azioni: [{ id: 'si', etichetta: _t('fig_leggi_google', 'Leggi con Google') }, { id: 'no', etichetta: _t('fig_no_continua', 'No, continua senza'), ruolo: 'primario' }]
        })).then(function (r) { return !!(r && r.azione === 'si'); }, function () { return false; });
    }

    /* Le opzioni di CREA per `extractPdfPages` (le due chiamate di `startGeneration`): la prova a secco (quella del
       caricamento, o la si aspetta, o la si fa), la risposta Google, il velo «Leggo le figure: ritaglio k di N» con
       «Salta le figure» (`onAnnulla` di `showLoadingOverlay`), il vault se c'è. Spenta o senza modulo: `{ origine }`. */
    var crea = new WeakMap();
    function opzioniCrea(src) {
        var file = src && src.file, base = { origine: 'crea', nome: file && file.name, vaultPath: (_st() || {}).activeVaultPath || null };
        if (!file || !attiva('crea')) return Promise.resolve({ origine: 'crea' });
        var stato = { saltato: false, velo: false };
        crea.set(file, stato);
        var salta = function () { stato.saltato = true; };
        var mostra = function (k, n) {
            if (!n || stato.saltato || typeof window.showLoadingOverlay !== 'function') return;
            var testo = _t('fig_velo_ritaglio', 'Leggo le figure: ritaglio {k} di {n}').replace('{k}', String(Math.min(k + 1, n))).replace('{n}', String(n));
            window.showLoadingOverlay(true, testo, window.currentLoadingMode || 'default', undefined, salta);
            stato.velo = true;
            var D = doc(), b = D && D.getElementById('loading-cancel');
            if (b) b.textContent = _t('fig_salta', 'Salta le figure');
        };
        var pronta = file._figure && file._figure.pagine ? Promise.resolve(file._figure)
            : Promise.resolve(file._figureInArrivo).catch(function () { return null; }).then(function (p) {
                if (p && p.pagine) return p;
                if (file._figure && file._figure.pagine) return file._figure;
                return Promise.resolve(file.arrayBuffer()).then(function (b) { return prova(b, { nome: file.name }); })
                    .then(function (p2) { file._figure = p2; if (src) src._figure = p2; return p2; });
            });
        return pronta.then(function (p) {
            var o = Object.assign({}, base, { onProgresso: mostra, annullato: function () { return stato.saltato; } });
            if (!p || !p.pdfScansione) return o;
            stato.scansioni = p.pagineScansione || 0;
            if (!chiavi().google) return o;    // senza chiave nessuna domanda (e niente da ricordare): l'avviso a fine lettura
            return leggiDossier(p, base).then(function (d) {
                if (d.google === 'si' || d.google === 'no') { o.google = d.google === 'si'; return o; }
                return domandaGoogle(stato.scansioni).then(function (si) { d.google = si ? 'si' : 'no'; o.google = si; scriviDeposito(d.impronta); return o; });
            });
        }).catch(function (e) { console.warn('[figure] opzioni di CREA: ' + (e && e.message || e)); return Object.assign({}, base); });
    }

    /* Dopo `extractPdfPages`, nelle due chiamate di CREA: il bottone del velo se ne va, il toast finale da
       `file._letturaFigure` (una volta sola: `leggi` lo dà già quando qualcosa non si è letto), l'avviso delle scansioni
       lette senza Google. */
    function fineCrea(file) {
        var stato = file && crea.get(file);
        if (stato && stato.velo && typeof window.showLoadingOverlay === 'function') window.showLoadingOverlay(true);
        var L = file && file._letturaFigure;
        if (!L) return;
        var r = L.riassunto;
        if (L.annullato) toast(_t('fig_saltate', 'Figure saltate: la mappa usa il solo testo tipografico. Le letture già fatte restano per la prossima volta.'), 'info');
        else if (r && !L.toastMostrato && (r.lette + r.rosse + r.nonLette) > 0) toast(L.toast, 'success');
        var k = (L.avvisi && L.avvisi.scansioni) || 0;
        if (L.avvisi && L.avvisi.scansioneNonLetta && avvisoScansione(L)) return;
        if (k && !(L.dossier && L.dossier.google === 'si')) toast(_t('fig_scansioni_parziali', '{k} pagine sono scansioni: le ho lette solo in parte').replace('{k}', String(k)), 'warning');
    }

    /* 0114, lotto 4 (D5; revisione 1 dell'ADR, punto 6): il PDF è una scansione e non è stato letto («No» a Google, o nessuna
       chiave), quindi alla mappa non arriva niente da lui. L'avviso è del motore (sopra il velo e le console: inv. 11,
       trappola 52) e si apre QUI, prima che `startGeneration` arrivi al suo toast generico, che resta (`app.js` non si
       tocca). Con la chiave Google, «Leggi con Google» cambia il «No» ricordato nel deposito: la generazione dopo legge con
       Google senza ridomandare (con il solo Aztechi la mappa non nasce, e in ELABORA non c'è una riga dove rileggerlo).
       → true se l'avviso si è aperto; senza motore o con un guasto false, e resta il toast di prima. */
    function avvisoScansione(L) {
        var MM = window.MappAIModal;
        if (!MM || typeof MM.open !== 'function') return false;
        var conChiave = !!chiavi().google, d = L.dossier;
        // un box solo (Giacomo al gate 3, 21/10: «aggrega i 4 blocchi di testo e crea un unico box di testo»)
        var frasi = [_t('fig_non_letta_testo', 'Questo PDF è una scansione e non è stato letto: dentro non c\'è testo che la mappa possa usare.')];
        if (conChiave) {
            frasi.push(_t('fig_non_letta_google', 'Puoi leggerlo con Google, con la tua chiave: scegli «Leggi con Google» e poi genera di nuovo. Se la mappa nasce dalle altre fonti, puoi farlo anche dopo: in ELABORA, tabella «Figure», riga del PDF, «Rileggi con Google».'));
            frasi.push(_t('fig_avviso_google', 'Il testo esce dalla Svizzera. Con la chiave gratuita Google può usarlo per i suoi prodotti e farlo leggere a persone. Non farlo se nel PDF ci sono lavori o nomi di allievi.'));
        } else {
            frasi.push(_t('fig_non_letta_senza_chiave', 'Per leggerlo con Google serve la chiave Google nel cassetto.'));
        }
        frasi.push(_t('fig_non_letta_testo_fonte', 'Oppure aggiungi una fonte di testo.'));
        var sezioni = [{ testo: frasi.join(' ') }];
        var azioni = (conChiave ? [{ id: 'si', etichetta: _t('fig_leggi_google', 'Leggi con Google') }] : [])
            .concat([{ id: 'ok', etichetta: _t('mm_ok', 'Ho capito'), ruolo: 'primario' }]);
        var aperta;
        try {
            aperta = MM.open({ titolo: _t('fig_non_letta_titolo', 'Questo PDF non è stato letto'), icona: 'scan-text', taglia: 's', sezioni: sezioni, azioni: azioni });
        } catch (e) { console.warn('[figure] avviso della scansione: ' + (e && e.message || e)); return false; }
        /* 0114, dal gate 3 (Giacomo: «2a»): il motore rimette il fuoco su chi ha aperto la finestra, cioè «Genera
           Mappa»: un Invio subito dopo rilanciava la generazione (dopo «Leggi con Google», a pagamento). Chiuso
           l'avviso il fuoco non resta su nessun bottone: per rigenerare serve un clic voluto. */
        var lasciaFuoco = function () {
            var D = doc(), a = D && D.activeElement;
            if (a && a !== D.body && typeof a.blur === 'function') { try { a.blur(); } catch (e) { /* niente */ } }
        };
        Promise.resolve(aperta).then(function (r) {
            lasciaFuoco();
            if (!(r && r.azione === 'si' && conChiave && d && d.impronta)) return;
            d.google = 'si';
            scriviDeposito(d.impronta);
            toast(_t('fig_non_letta_ricordato', 'Alla prossima generazione lo leggo con Google.'), 'info');
        }, function () { lasciaFuoco(); /* chiusa: resta il «No» */ });
        return true;
    }

    window.MappAIFigure = {
        VERSIONE: VERSIONE, WORKER_OCR: WORKER_OCR,
        attiva: attiva, misura: misura, prova: prova, decidi: decidi, stima: stima, leggi: leggi,
        scriviDossier: scriviDossier, dossierDi: function (impronta) { return dossierCache[impronta] || null; },
        trovaDossier: trovaDossier, leggiUno: leggiUno, rileggiPagina: rileggiPagina, correggi: correggi, conferma: conferma, confermaRiga: confermaRiga, letturaDiVoce: function (v) { return letturaDiVoce(CORE(), v); },
        aggiornaStima: aggiornaStima, opzioniCrea: opzioniCrea, fineCrea: fineCrea, domandaGoogle: domandaGoogle,
        lingueOcr: lingueOcr, promptDi: promptDi, chiama: chiama, ritaglia: ritaglia, tintePiatte: tintePiatte,
        oggettiImmagine: oggettiImmagine, pezziTesto: pezziTesto, righeDaPezzi: righeDaPezzi,
        _deps: deps, _ocr: ocr, _cache: dossierCache, _RITENTI_429: RITENTI_429
    };
})();
