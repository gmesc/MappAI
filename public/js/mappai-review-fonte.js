/* ═══════════════════════════════════════════════════════════════════════════
   LA FONTE ACCANTO ALLA SCHEDA — «Rivedi i contenuti / i materiali» (16/9/26)

   PERCHÉ. Per verificare una segnalazione il docente doveva aprire il PDF da
   un'altra parte e cercare la frase: la fatica della revisione era CERCARE, non
   giudicare. Il Banco di validazione del branch codex aveva risolto la cosa con
   due colonne — la fonte e ciò che si valuta — e Giacomo ha chiesto di portare
   quella «pelle» nella revisione vera (16/9).

   CHE COSA FA. Un pannello con la pagina della fonte che sostiene la segnalazione
   attiva: il PDF originale da `Allegati/` del vault quando c'è (zoom sul
   puntatore, trascinamento, tastiera: + − frecce 0), e sempre il testo archiviato
   della pagina con la citazione evidenziata. Senza PDF (testo incollato, pagina
   web) resta il solo testo.

   ORIGINE. Il visore è `local-ai/review-pdf.js` del Banco, con la stessa
   geometria di Proietta (`MappAIProiezioneCore`), legato agli elementi del
   pannello invece che a id globali, e smontabile alla chiusura del modale.
   La parte pura (indice, PDF, pagina, evidenziazione) è testata in Node:
   tests/review-fonte.test.js.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./mappai-grounding-core.js'));
    else root.MappAIReviewFonte = factory(root.MappAIGroundingCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (G) {
    'use strict';
    const testo = v => String(v == null ? '' : v);
    const chiave = s => testo(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.pdf$/i, '').replace(/[^a-z0-9]+/g, '');

    // ── parte pura ─────────────────────────────────────────────────────────────
    /* Le pagine della revisione, con gli stessi docId che `buildInput` dà alle
       citazioni: così una citazione ritrova la sua pagina anche quando due
       documenti hanno una pagina 1. */
    function indicePagine(sources) {
        const pagine = G && typeof G.sourcePages === 'function' ? G.sourcePages(sources) : [];
        return pagine.map((p, i) => ({ id: 'p' + i, docId: p.docId, title: p.title, page: p.page, text: p.text }));
    }
    /* Il PDF di una fonte in `Allegati/`: prima il nome identico (è così che lo
       salva la generazione), poi lo stesso nome senza accenti, maiuscole e segni. */
    function trovaPdf(titolo, nomi) {
        const pdf = (nomi || []).map(testo).filter(n => /\.pdf$/i.test(n));
        if (!pdf.length || !chiave(titolo)) return null;
        return pdf.find(n => n === testo(titolo)) || pdf.find(n => chiave(n) === chiave(titolo)) || null;
    }
    /* La foto di un dossier in `Allegati/` (0069, ADR 0016). La pipeline la copia
       col nome del titolo (`safeName(titolo)` + estensione): prima quel nome, poi
       l'unica immagine della cartella. Con più immagini e nessun nome che combacia
       → null: meglio la scheda senza foto che la foto di un altro nodo. Mai un PDF. */
    function trovaFoto(nomi, titolo) {
        const img = (nomi || []).map(testo).filter(n => /\.(jpe?g|png|webp|gif)$/i.test(n));
        if (!img.length) return null;
        const senzaEstensione = n => n.replace(/\.[a-z0-9]+$/i, '');
        const perNome = chiave(titolo) ? img.find(n => chiave(senzaEstensione(n)) === chiave(titolo)) : null;
        return perNome || (img.length === 1 ? img[0] : null);
    }
    /* 0069, giro 10 (Giacomo: «lascia solo i bottoni per accedere ai blocchi e
       rimuovi il menu a tendina, crea un piccolo bottone 'x' in fondo alla riga»).
       Con la foto (la scheda come fonte): niente tendina delle pagine, e «×» in
       fondo alla riga delle prove quando ce n'è almeno una. Un PDF: la tendina
       come sempre, niente «×». */
    function barraFonte(o) {
        o = o || {};
        const conFoto = o.immagine === true;
        return { tendina: !conFoto, chiudi: conFoto && Number(o.prove) > 0 };
    }
    /* La vista «nessuna selezione» con la foto: tutta la scheda, ogni parte col
       suo titolo — la stessa del dossier senza aggancio. */
    function testoIntero(indice) {
        return (Array.isArray(indice) ? indice : []).map(p => p.title + '\n' + p.text).join('\n\n');
    }
    /* 0074, F4 (Giacomo, 06/10: «Almeno tre parole»): una prova si cerca nella fonte solo se è una
       citazione, cioè se ha almeno tre parole con lettere. «-1», «2», una sigla o una parola sola si
       ritrovano in qualunque pagina: aprirebbero la pagina sbagliata e sottolineerebbero un numero.
       Una parola è un pezzo fra due spazi che contiene almeno una lettera (di qualunque alfabeto). */
    function eCitazione(prova) {
        const valore = typeof prova === 'string' ? prova : prova && typeof prova === 'object' ? prova.text : '';
        return testo(valore).split(/\s+/).filter(p => /\p{L}/u.test(p)).length >= 3;
    }
    /* 0074: il segno col colore della macroarea (richiesta del 28/09). È un elemento non testuale, quindi
       contro il fondo della pagina deve fare almeno 3:1 (WCAG 1.4.11): un colore d'area più chiaro si
       scurisce, tenendo la sua tinta, quanto basta per arrivarci. Accetta #rgb(a), #rrggbb(aa), rgb(a)()
       e hsl(a)() — gli stessi che `safeColor` lascia passare (mappai-review-context.js); un colore
       trasparente si compone prima sul fondo. Qualunque altra cosa → null, e il segno resta il giallo.
       Giro 2 (4b): i canali si leggono come li legge il browser per il pallino — percentuali di 255,
       tinta con segno e in gradi, sintassi a virgole o a spazi; un colore che `safeColor` lascia passare
       ma che qui non si legge ripiega al grigio neutro delle aree (NEUTRO), mai al giallo. */
    const N = '([+-]?(?:\\d+\\.?\\d*|\\.\\d+))';
    const RGB = new RegExp('^rgba?\\(\\s*' + N + '(%?)\\s*[,\\s]\\s*' + N + '(%?)\\s*[,\\s]\\s*' + N + '(%?)\\s*(?:[,/]\\s*' + N + '(%?)\\s*)?\\)$');
    const HSL = new RegExp('^hsla?\\(\\s*' + N + '(?:deg)?\\s*[,\\s]\\s*' + N + '%\\s*[,\\s]\\s*' + N + '%\\s*(?:[,/]\\s*' + N + '(%?)\\s*)?\\)$');
    // la stessa forma di `safeColor` (mappai-review-context.js, non esportata): ciò che il pallino dell'area accetta
    const SAFE = v => /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(v) || /^(?:rgb|hsl)a?\([\d\s.,%+\-/]+\)$/i.test(v);
    const NEUTRO = '#64748b';   // il grigio delle aree senza colore (mappai-review-context.js, NEUTRAL)
    const fra = (x, a, b) => Math.min(b, Math.max(a, x));
    const alfa = (x, pct) => x === undefined ? 1 : fra(Number(x) / (pct ? 100 : 1), 0, 1);
    function canali(colore) {
        const v = testo(colore).trim().toLowerCase();
        let m = v.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
        if (m) {
            const h = m[1].length <= 4 ? m[1].split('').map(c => c + c).join('') : m[1];
            return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).concat(h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1);
        }
        m = v.match(RGB);
        if (m) return [1, 3, 5].map(i => fra(m[i + 1] ? Number(m[i]) * 255 / 100 : Number(m[i]), 0, 255)).concat(alfa(m[7], m[8]));   // ×255/100, non ×2,55: 50% deve dare 127,5
        m = v.match(HSL);
        if (m) {
            const hh = ((Number(m[1]) % 360) + 360) % 360 / 360, s = fra(Number(m[2]) / 100, 0, 1), l = fra(Number(m[3]) / 100, 0, 1);
            const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
            const k = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
            return [k(hh + 1 / 3), k(hh), k(hh - 1 / 3)].map(x => Math.round(x * 255)).concat(alfa(m[4], m[5]));
        }
        return null;
    }
    function luminanza(c) {
        const [r, g, b] = c.slice(0, 3).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    /* Il rapporto di contrasto WCAG fra due colori (1…21); null se uno dei due non è un colore. */
    function contrasto(a, b) {
        const ca = Array.isArray(a) ? a : canali(a), cb = Array.isArray(b) ? b : canali(b);
        if (!ca || !cb) return null;
        const la = luminanza(ca), lb = luminanza(cb);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }
    const esa = c => '#' + c.slice(0, 3).map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
    function coloreSegno(colore, fondo, minimo) {
        const f = canali(fondo || '#ffffff') || [255, 255, 255, 1], soglia = minimo || 3;
        const c = typeof colore === 'string' ? canali(colore) || (SAFE(colore.trim()) ? canali(NEUTRO) : null) : null;
        if (!c) return null;
        const pieno = c.slice(0, 3).map((x, i) => x * c[3] + f[i] * (1 - c[3]));   // un colore trasparente si vede sul fondo
        if (contrasto(pieno, f) >= soglia) return esa(pieno);
        // si scurisce a passi piccoli verso il nero, tenendo la tinta: il primo che arriva alla soglia
        for (let k = 0.99; k > 0; k -= 0.01) {
            const scuro = pieno.map(x => Math.round(x * k));
            if (contrasto(scuro, f) >= soglia) return esa(scuro);
        }
        return '#000000';
    }
    /* La pagina di una prova. `prova` può essere una prova del controllo
       ({ text, title|source, page, sourceId }), una citazione ({ docId, title,
       page, text }) o un chunk ({ source: 'pagina 3', text }). Vince la pagina
       che CONTIENE il testo; altrimenti documento e numero di pagina. */
    /* `rigorosa` (0069, la scheda come fonte): niente ripiego sulla prima pagina.
       Una prova si aggancia a un blocco solo se ne contiene il testo, o se lo nomina
       per documento o per titolo; altrimenti null, e il pannello mostra la scheda
       intera senza fingere che il rimando punti a «Carta d'identità». */
    function paginaPer(prova, indice, rigorosa) {
        if (!prova || !Array.isArray(indice) || !indice.length) return null;
        const titolo = testo(prova.title || (typeof prova.source === 'string' && !/^pagina\s+\d+$/i.test(prova.source) ? prova.source : ''));
        const numero = Number(prova.page || (testo(prova.source).match(/(?:pag(?:ina|e)?\.?|p\.)\s*(\d+)/i) || [])[1] || 0);
        let pool = indice;
        const restringi = f => { const r = pool.filter(f); if (r.length) pool = r; return r.length > 0; };
        const perDoc = prova.docId ? restringi(p => p.docId === prova.docId) : false;
        const perTitolo = !perDoc && titolo ? restringi(p => p.title === titolo || chiave(p.title) === chiave(titolo)) : false;
        if (numero) restringi(p => p.page === numero);
        const citato = testo(prova.text).trim();
        if (citato && G && typeof G.originalExcerpt === 'function') {
            const con = pool.find(p => G.originalExcerpt(p.text, citato) !== null) || indice.find(p => G.originalExcerpt(p.text, citato) !== null);
            if (con) return con;
        }
        if (rigorosa) return (perDoc || perTitolo) ? pool[0] : null;
        return (numero || prova.docId || titolo) ? pool[0] : null;
    }
    /* Il testo della pagina in pezzi, con la citazione marcata. Si usa
       `originalExcerpt`, che tollera spazi e tipografia del PDF: evidenzia il
       punto vero anche quando la prova è stata copiata «in bella». */
    function segmenti(testoPagina, citazione) {
        const valore = testo(testoPagina);
        const estratto = citazione && G && typeof G.originalExcerpt === 'function' ? G.originalExcerpt(valore, testo(citazione)) : null;
        const inizio = estratto ? valore.indexOf(estratto) : -1;
        if (inizio < 0) return [{ t: valore, segnato: false }];
        return [{ t: valore.slice(0, inizio), segnato: false }, { t: estratto, segnato: true }, { t: valore.slice(inizio + estratto.length), segnato: false }]
            .filter(s => s.t);
    }

    /* La citazione SUL PDF (17/9/26). `items` sono i pezzi di `page.getTextContent()`,
       `vt` la trasformazione del viewport a scala 1. I pezzi si uniscono con uno
       spazio (a `originalExcerpt` gli spazi non contano, e pdf.js spezza anche a
       metà parola), si cerca la citazione con la stessa tolleranza del testo
       archiviato, e ogni pezzo toccato dà un rettangolo in punti della pagina,
       tagliato in proporzione ai caratteri se la citazione comincia o finisce a
       metà pezzo. Nessuna corrispondenza → []: la pagina resta senza segni. */
    function rettangoli(items, citazione, vt) {
        const pezzi = (items || []).filter(it => it && typeof it.str === 'string' && Array.isArray(it.transform));
        if (!pezzi.length || !testo(citazione).trim() || !G || typeof G.originalExcerpt !== 'function') return [];
        let unito = '';
        const dove = [];   // per ogni carattere di `unito`: [pezzo, posizione] oppure null per il separatore
        pezzi.forEach((it, k) => {
            if (k) { unito += ' '; dove.push(null); }
            for (let c = 0; c < it.str.length; c++) dove.push([k, c]);
            unito += it.str;
        });
        const estratto = G.originalExcerpt(unito, testo(citazione));
        const inizio = estratto ? unito.indexOf(estratto) : -1;
        if (inizio < 0) return [];
        const tratti = new Map();   // pezzo → [primo carattere, ultimo+1]
        for (let i = inizio; i < inizio + estratto.length; i++) {
            if (!dove[i]) continue;
            const [k, c] = dove[i], t = tratti.get(k);
            tratti.set(k, t ? [t[0], c + 1] : [c, c + 1]);
        }
        const m = vt || [1, 0, 0, 1, 0, 0];
        const out = [];
        tratti.forEach(([a, b], k) => {
            const it = pezzi[k], s = it.transform, n = it.str.length || 1;
            const tx = [m[0] * s[0] + m[2] * s[1], m[1] * s[0] + m[3] * s[1], m[0] * s[2] + m[2] * s[3], m[1] * s[2] + m[3] * s[3],
                m[0] * s[4] + m[2] * s[5] + m[4], m[1] * s[4] + m[3] * s[5] + m[5]];
            const alto = Math.hypot(tx[2], tx[3]) || (it.height || 10), largo = (it.width || 0) * Math.hypot(m[0], m[1]);
            if (largo <= 0) return;
            const r = { x: tx[4] + largo * a / n, y: tx[5] - alto * 0.9, w: largo * (b - a) / n, h: alto * 1.15 };
            // Stessa riga del segno precedente (pdf.js dà spesso un pezzo per parola): una striscia sola, senza buchi fra le parole.
            const prima = out[out.length - 1];
            if (prima && Math.abs(prima.y - r.y) < Math.min(prima.h, r.h) * 0.3 && r.x >= prima.x) {
                const fine = Math.max(prima.x + prima.w, r.x + r.w);
                prima.y = Math.min(prima.y, r.y); prima.h = Math.max(prima.h, r.h); prima.w = fine - prima.x;
            } else out.push(r);
        });
        return out;
    }

    // ── il visore PDF (dal Banco) ───────────────────────────────────────────────
    function visore(viewer, canvas, stato, adatta, avvisa) {
        const C = globalThis.MappAIProiezioneCore;
        let page = null, width = 1, height = 1, state = { z: 1, x: 0, y: 0 }, fitted = true, drag = null;
        let renderTask = null, renderVersion = 0, timer = null, rasterScale = 0, segni = [], tinta = null;
        function apply() {
            state = C.clampPan(state, width, height, viewer.clientWidth, viewer.clientHeight);
            canvas.style.transform = 'translate(' + state.x + 'px,' + state.y + 'px) scale(' + state.z + ')';
            adatta.title = avvisa('rv_source_fit', 'Adatta alla larghezza (0)') + ' · Zoom ' + Math.round(state.z * 100) + '%';
        }
        function fallito(error) {
            canvas.hidden = true; stato.hidden = false; stato.textContent = error && error.message ? error.message : String(error);
            viewer.setAttribute('aria-busy', 'false');
        }
        async function render() {
            if (!page || !viewer.clientWidth) return;
            // Bitmap al massimo di 16 MP / 8192 px per lato, anche su Retina a 8×.
            const scale = Math.min(state.z * (globalThis.devicePixelRatio || 1), Math.sqrt(16000000 / (width * height)), 8192 / Math.max(width, height));
            if (scale === rasterScale && !canvas.hidden) {
                if (renderTask) { renderVersion++; renderTask.cancel(); renderTask = null; }
                return;
            }
            const version = ++renderVersion, target = page;
            if (renderTask) renderTask.cancel();
            let task;
            try {
                const buffer = document.createElement('canvas'), viewport = target.getViewport({ scale });
                buffer.width = Math.max(1, Math.floor(viewport.width)); buffer.height = Math.max(1, Math.floor(viewport.height));
                task = target.render({ canvasContext: buffer.getContext('2d'), viewport }); renderTask = task;
                await task.promise;
                if (version !== renderVersion || target !== page) return;
                if (segni.length && tinta) {   // 0074: col colore dell'area una sottolineatura piena in fondo al rigo, sotto le lettere
                    /* Lo spessore, in px della tela: il 12% del rigo, e mai meno di 2 px CSS a schermo (giro 2, 4c).
                       Un px della tela vale z / scale px CSS (la tela è disegnata a `scale` e mostrata a `state.z`),
                       quindi 2 px CSS sono 2 × scale / z px della tela: su uno schermo a densità doppia, 4. */
                    const ctx = buffer.getContext('2d'), minimo = 2 * scale / (state.z || 1);
                    ctx.save(); ctx.fillStyle = tinta;
                    segni.forEach(r => { const alto = Math.max(minimo, r.h * scale * 0.12); ctx.fillRect(r.x * scale, (r.y + r.h) * scale - alto, r.w * scale, alto); });
                    ctx.restore();
                } else if (segni.length) {   // la citazione, nello stesso giallo del testo archiviato; «multiply» lascia leggere l'inchiostro
                    const ctx = buffer.getContext('2d');
                    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#fef08a';
                    segni.forEach(r => ctx.fillRect(r.x * scale, r.y * scale, r.w * scale, r.h * scale));
                    ctx.restore();
                }
                canvas.width = buffer.width; canvas.height = buffer.height;
                canvas.getContext('2d').drawImage(buffer, 0, 0);
                rasterScale = scale; canvas.hidden = false; stato.hidden = true;
                viewer.setAttribute('aria-busy', 'false');
            } catch (error) {
                if (version === renderVersion && error.name !== 'RenderingCancelledException') fallito(error);
            } finally { if (renderTask === task) renderTask = null; }
        }
        const programma = () => { clearTimeout(timer); timer = setTimeout(render, 120); };
        function fit() {
            if (!page) return;
            fitted = true;
            const z = C.clampZ(viewer.clientWidth / width);
            // Con una citazione, la vista si apre centrata sul suo primo rigo invece che in cima alla pagina.
            const y = segni.length ? viewer.clientHeight / 2 - (segni[0].y + segni[0].h / 2) * z : 0;
            state = { z, x: (viewer.clientWidth - width * z) / 2, y };
            apply(); programma();
        }
        function zoom(x, y, factor) {
            if (!page || canvas.hidden) return;
            fitted = false; state = C.zoomAlPunto(state, x, y, factor); apply(); programma();
        }
        function fineTrascinamento() {
            if (drag && viewer.hasPointerCapture && viewer.hasPointerCapture(drag.id)) viewer.releasePointerCapture(drag.id);
            drag = null; delete viewer.dataset.dragging;
        }
        const ascolti = [];
        const ascolta = (el, nome, fn, o) => { el.addEventListener(nome, fn, o); ascolti.push([el, nome, fn, o]); };
        ascolta(viewer, 'wheel', event => {
            if (!page || canvas.hidden || !event.deltaY) return;
            event.preventDefault(); fineTrascinamento();
            const b = viewer.getBoundingClientRect();
            const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewer.clientHeight : 1);
            zoom(event.clientX - b.left, event.clientY - b.top, Math.exp(-Math.max(-200, Math.min(200, delta)) * .002));
        }, { passive: false });
        ascolta(viewer, 'pointerdown', event => {
            if (event.button !== 0 || !event.isPrimary || !page || canvas.hidden) return;
            event.preventDefault(); viewer.focus({ preventScroll: true });
            fitted = false; drag = { id: event.pointerId, x: event.clientX, y: event.clientY, sx: state.x, sy: state.y };
            viewer.setPointerCapture(event.pointerId); viewer.dataset.dragging = 'true';
        });
        ascolta(viewer, 'pointermove', event => {
            if (!drag || drag.id !== event.pointerId) return;
            state.x = drag.sx + event.clientX - drag.x; state.y = drag.sy + event.clientY - drag.y; apply();
        });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => ascolta(viewer, n, fineTrascinamento));
        ascolta(viewer, 'keydown', event => {
            if (!page || canvas.hidden || event.metaKey || event.ctrlKey || event.altKey) return;
            if (!['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            if (event.key === '0') fit();
            else if (['+', '=', '-'].includes(event.key)) zoom(viewer.clientWidth / 2, viewer.clientHeight / 2, event.key === '-' ? 1 / 1.2 : 1.2);
            else {
                fitted = false;
                state.x += ({ ArrowLeft: 48, ArrowRight: -48 }[event.key] || 0);
                state.y += ({ ArrowUp: 48, ArrowDown: -48 }[event.key] || 0); apply();
            }
        });
        ascolta(adatta, 'click', fit);
        const osservatore = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (page) { if (fitted) fit(); else apply(); } }) : null;
        if (osservatore) osservatore.observe(viewer);
        return {
            caricamento() {
                fineTrascinamento(); clearTimeout(timer); renderVersion++;
                if (renderTask) renderTask.cancel();
                page = null; rasterScale = 0; canvas.hidden = true; stato.hidden = false;
                stato.textContent = avvisa('rv_source_loading', 'Apro la pagina del PDF originale…'); viewer.setAttribute('aria-busy', 'true');
            },
            /* `colore` (0074): la tinta della sottolineatura, già portata a 3:1 (`coloreSegno`); senza, il giallo */
            async mostra(pagina, rett, colore) {
                page = pagina; segni = rett || []; tinta = colore || null;
                const base = page.getViewport({ scale: 1 }); width = base.width; height = base.height;
                canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
                fit(); clearTimeout(timer); await render();
            },
            fallito,
            /* Un'altra prova sulla stessa pagina: niente ricaricamento, solo i segni nuovi. */
            evidenzia(rett, colore) {
                segni = rett || []; tinta = colore || null; rasterScale = 0;
                if (fitted) fit(); else { apply(); programma(); }
            },
            smonta() {
                fineTrascinamento(); clearTimeout(timer); renderVersion++;
                if (renderTask) renderTask.cancel();
                if (osservatore) osservatore.disconnect();
                ascolti.forEach(([el, nome, fn, o]) => el.removeEventListener(nome, fn, o));
                page = null;
            }
        };
    }

    // ── il pannello ─────────────────────────────────────────────────────────────
    /* opts: { sources, t(key, fallback), leggiPdf(titolo) → Promise<Uint8Array|null> }.
       Senza pdfjsLib, MappAIProiezioneCore o un PDF per la fonte, resta il testo.
       0074 (la veste di G2 le passa tutte e tre; senza, il pannello di oggi):
       · `testoAperto` (F2, Giacomo 06/10: «Aperto, ma richiudibile») — il testo della pagina parte aperto e il
         pannello non lo apre né lo chiude più da sé: se il docente lo chiude resta chiuso finché il Banco è aperto;
       · `soloCitazioni` (F4) — si cercano nella fonte solo le prove che sono citazioni (`eCitazione`); con la
         foto no: la ricerca dei blocchi è già rigorosa (giro 2, «F4 non vale per la foto»);
       · `vuoto` — la frase al posto della pagina quando nessuna prova ne trova una. */
    function monta(host, opts) {
        opts = opts || {};
        const t = typeof opts.t === 'function' ? opts.t : (_k, f) => f;
        const testoAperto = opts.testoAperto === true, soloCitazioni = opts.soloCitazioni === true;
        const veste = testoAperto || soloCitazioni;   // le opzioni che passa solo la veste di G2 (0074)
        const indice = indicePagine(opts.sources || []);
        /* 0069 (ADR 0016): per un dossier da immagine il pannello mostra la FOTO
           analizzata al posto del PDF, e sotto i blocchi della scheda. `opts.immagine`
           → Promise<{src}|null>; `opts.etichette` = { titolo, testo } della scheda. */
        const immagine = typeof opts.immagine === 'function' ? opts.immagine : null;
        const etichette = opts.etichette || {};
        const crea = (tag, cls, txt) => { const el = document.createElement(tag); if (cls) el.className = cls; if (txt != null) el.textContent = txt; return el; };
        host.replaceChildren();
        host.setAttribute('aria-label', t('rv_source_panel', 'Fonte della segnalazione'));
        const testa = crea('header', 'mrv-fonte-testa');
        const titolo = crea('h3', null, etichette.titolo || t('rv_source_title', 'Fonte'));
        const prove = crea('div', 'mrv-fonte-prove'); prove.setAttribute('role', 'group'); prove.setAttribute('aria-label', t('rv_source_proofs', 'Prove della segnalazione'));
        const scelta = crea('select', 'mrv-fonte-pagina'); scelta.setAttribute('aria-label', t('rv_source_page', 'Pagina della fonte'));
        const icona = (el, nome) => { el.innerHTML = '<i data-lucide="' + nome + '" aria-hidden="true"></i>'; return el; };
        const disegna = () => { if (typeof globalThis.safeCreateIcons === 'function') globalThis.safeCreateIcons(); };
        const adatta = icona(crea('button', 'pm-btn-cancel mrv-icona mrv-fonte-adatta'), 'move-horizontal'); adatta.type = 'button';
        adatta.setAttribute('aria-label', t('rv_source_fit', 'Adatta alla larghezza (0)')); adatta.title = t('rv_source_fit', 'Adatta alla larghezza (0)');
        testa.append(titolo, prove, scelta, adatta);
        const viewer = crea('div', 'mrv-fonte-pdf'); viewer.tabIndex = 0; viewer.setAttribute('role', 'region');
        viewer.setAttribute('aria-label', t('rv_source_pdf_help', 'PDF originale: rotellina per lo zoom, trascina per spostare. Tastiera: più, meno, frecce; zero adatta alla larghezza.'));
        const canvas = crea('canvas'); canvas.hidden = true; canvas.setAttribute('aria-label', t('rv_source_canvas', 'Pagina del PDF originale'));
        const stato = crea('p', 'mrv-fonte-stato'); stato.setAttribute('role', 'status');
        viewer.append(canvas, stato);
        const note = crea('details', 'mrv-fonte-testo');
        const riassunto = crea('summary', null, etichette.testo || t('rv_source_text', 'Testo archiviato della pagina'));
        const righe = crea('p', 'mrv-fonte-righe'); righe.tabIndex = 0;
        note.append(riassunto, righe);
        if (testoAperto) note.open = true;
        const vuoto = crea('p', 'mrv-fonte-vuoto', typeof opts.vuoto === 'string' && opts.vuoto ? opts.vuoto
            : t('rv_source_empty', 'Questa segnalazione non indica una pagina della fonte. Scegli una pagina dall’elenco.'));
        host.append(testa, viewer, note, vuoto);
        disegna();
        /* la foto sta sopra il testo e non cambia con la prova: è la fonte intera.
           Stile in linea: il foglio del Banco non è di questo packet. */
        if (immagine) {
            viewer.hidden = true; adatta.hidden = true;
            const figura = crea('figure', 'mrv-fonte-foto');
            figura.style.cssText = 'margin:0;padding:var(--mm-btn-gap);flex:0 0 auto;text-align:center';
            const attesa = crea('p', 'mrv-fonte-vuoto', t('rv_scheda_foto_attesa', 'Apro l’immagine analizzata…'));
            figura.appendChild(attesa);
            host.insertBefore(figura, note);
            Promise.resolve().then(() => immagine()).then(f => {
                if (!host.contains(figura)) return;
                if (!f || !f.src) { attesa.textContent = t('rv_scheda_foto_manca', 'L’immagine analizzata non è nella cartella del dossier: qui sotto c’è la scheda.'); return; }
                const img = crea('img');
                img.src = f.src; img.alt = t('rv_scheda_foto_alt', 'L’immagine analizzata');
                /* locale (09 §6, gradino 5): metà altezza della finestra, perché sotto la foto
                   deve restare in vista il testo della scheda; dipende dalla finestra, non dai token */
                img.style.cssText = 'display:block;max-width:100%;max-height:45vh;margin:0 auto;object-fit:contain';
                figura.replaceChildren(img);
            }).catch(() => { if (host.contains(figura)) attesa.textContent = t('rv_scheda_foto_manca', 'L’immagine analizzata non è nella cartella del dossier: qui sotto c’è la scheda.'); });
        }

        // elenco delle pagine, raggruppato per documento
        const gruppi = new Map();
        indice.forEach(p => {
            if (!gruppi.has(p.docId)) { const g = crea('optgroup'); g.label = p.title; gruppi.set(p.docId, g); }
            const o = crea('option', null, p.page ? t('rv_source_page_short', 'Pag.') + ' ' + p.page : p.title); o.value = p.id;
            gruppi.get(p.docId).appendChild(o);
        });
        gruppi.forEach(g => scelta.appendChild(g));
        /* giro 10: con la foto la tendina non c'è (si va ai blocchi coi bottoni delle
           prove e con «×»); per un PDF l'espressione è quella di sempre */
        scelta.hidden = !indice.length || !barraFonte({ immagine: !!immagine }).tendina;

        const pdfPronto = !immagine && !!(globalThis.pdfjsLib && globalThis.MappAIProiezioneCore && typeof opts.leggiPdf === 'function');
        const v = pdfPronto ? visore(viewer, canvas, stato, adatta, t) : null;
        const documenti = new Map();      // titolo → Promise<PDFDocumentProxy|null>
        let corrente = null, citazione = '', richiesta = 0, proveAttive = [], chiuso = false, coloreArea = null;

        function documento(titoloFonte) {
            if (!documenti.has(titoloFonte)) {
                documenti.set(titoloFonte, Promise.resolve(opts.leggiPdf(titoloFonte)).then(bytes => bytes && bytes.length
                    ? globalThis.pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise : null).catch(() => null));
            }
            return documenti.get(titoloFonte);
        }
        function soloTesto(si) {
            host.classList.toggle('mrv-fonte--solo-testo', si);
            viewer.hidden = si; adatta.hidden = si;
            if (si && !testoAperto) note.open = true;
        }
        async function vaiA(pagina, frase) {
            if (chiuso) return;
            const id = ++richiesta;
            /* una prova che non indica un blocco (o un dossier di prima, coi rimandi
               senza aggancio): con la foto si legge la scheda intera, mai un pannello vuoto */
            if (!pagina && immagine && indice.length) {
                vuoto.hidden = true; note.hidden = false; soloTesto(true); scelta.value = '';
                righe.replaceChildren(document.createTextNode(testoIntero(indice)));
                return;
            }
            vuoto.hidden = !!pagina; note.hidden = !pagina;
            if (!pagina) { soloTesto(true); viewer.hidden = true; return; }
            scelta.value = pagina.id; citazione = frase || '';
            righe.replaceChildren(...segmenti(pagina.text, citazione).map(s => s.segnato ? crea('mark', null, s.t) : document.createTextNode(s.t)));
            const segno = righe.querySelector('mark');
            if (!v) { soloTesto(true); if (segno && segno.scrollIntoView) segno.scrollIntoView({ block: 'center' }); return; }
            if (corrente && corrente.id === pagina.id) {
                if (corrente.testoPdf) v.evidenzia(rettangoli(corrente.testoPdf.items, citazione, corrente.vt), coloreArea);
                return;
            }
            corrente = pagina;
            v.caricamento(); soloTesto(false);
            if (!testoAperto) note.open = false;   // F2: con la veste il testo resta come l'ha lasciato il docente
            const doc = await documento(pagina.title);
            if (id !== richiesta || chiuso) return;
            if (!doc) { soloTesto(true); corrente = null; return; }
            try {
                const numero = Math.min(Math.max(1, pagina.page || 1), doc.numPages);
                const p = await doc.getPage(numero);
                const testoPdf = await p.getTextContent().catch(() => null);   // senza strato di testo: pagina senza segni
                if (id !== richiesta || chiuso) return;
                const vt = p.getViewport({ scale: 1 }).transform;
                Object.assign(pagina, { testoPdf, vt });
                await v.mostra(p, testoPdf ? rettangoli(testoPdf.items, citazione, vt) : [], coloreArea);
                scelta.title = pagina.title + ' · ' + t('rv_page', 'Pagina') + ' ' + numero + ' / ' + doc.numPages;
            } catch (error) { if (id === richiesta) { v.fallito(error); if (!testoAperto) note.open = true; } }
        }
        scelta.addEventListener('change', () => { corrente = null; vaiA(indice.find(p => p.id === scelta.value), ''); });
        /* con la foto il pannello parte dalla scheda intera, non da «nessuna pagina» */
        if (immagine) vaiA(null, '');

        return {
            /* Le prove di una segnalazione (o una sola). Mostra la prima che ha una
               pagina; con più prove compaiono i bottoni «Prova 1, 2…».
               0074: restituisce QUANTE prove hanno trovato una pagina (i doppioni una
               volta): la veste ci decide se la Fonte resta aperta (F1). `o.colore` è il
               colore della macroarea del materiale: il segno lo prende, portato a 3:1;
               senza, il giallo di oggi. Con `soloCitazioni` le prove che non sono
               citazioni non si cercano (F4): non aprono pagine e non contano.
               Giro 2 (06/10, «F4 non vale per la foto»): con la foto la ricerca dei
               blocchi è già rigorosa (`paginaPer`), e una citazione corta di un blocco
               («Wählt CDU!») tiene il suo bottone. Con le opzioni della veste la chiave
               dei doppioni toglie anche gli spazi in testa e in coda (4a); senza, è
               quella di oggi. */
            mostra(elenco, o) {
                const viste = new Set(), pulisci = s => s.replace(/\s+/g, ' ');
                const chiaveProva = x => x.pagina.id + '|' + (veste ? pulisci(testo(x.prova.text)).trim() : pulisci(testo(x.prova.text))).slice(0, 120);
                const lista = (Array.isArray(elenco) ? elenco : [elenco]).filter(Boolean)
                    .filter(prova => !soloCitazioni || !!immagine || eCitazione(prova))
                    .map(prova => ({ prova, pagina: paginaPer(prova, indice, !!immagine) })).filter(x => x.pagina)
                    .filter(x => { const k = chiaveProva(x); if (viste.has(k)) return false; viste.add(k); return true; });
                const nuovo = coloreSegno(o && o.colore);
                const firma = lista.length ? (nuovo || '') + '§' + lista.map(x => x.pagina.id + '|' + testo(x.prova.text).slice(0, 80)).join('§') : '';
                if (firma && firma === proveAttive.firma) return lista.length;
                coloreArea = nuovo;
                host.classList.toggle('mrv-fonte--segno-area', !!coloreArea);
                if (coloreArea) host.style.setProperty('--mrv-fonte-segno', coloreArea);
                proveAttive = lista; proveAttive.firma = firma;
                prove.replaceChildren();
                /* 0069, giro 9: sulla scheda (pannello con la foto) le prove si
                   chiamano come la PARTE citata — il nome lo dà il core del dossier
                   (`etichetteProve`); null (un PDF, una lista mista) → «Prova n», come prima.
                   Lo scorritore dice «Parte · i / N». */
                const DFc = immagine ? globalThis.MappAIDossierFonteCore : null;
                const nomi = DFc && typeof DFc.etichetteProve === 'function' ? DFc.etichetteProve(lista.map(x => x.pagina)) : null;
                /* Fino a quattro prove, un bottone ciascuna; oltre (una sezione di
                   sintesi ne cita anche 17) uno scorritore, che non riempie la testata. */
                if (lista.length > 4) {
                    let i = 0;
                    const prima = icona(crea('button', 'pm-btn-cancel mrv-icona'), 'chevron-left'), dopo = icona(crea('button', 'pm-btn-cancel mrv-icona'), 'chevron-right'), conta = crea('span', 'mrv-fonte-conta');
                    prima.type = dopo.type = 'button';
                    prima.setAttribute('aria-label', t('rv_source_prev_proof', 'Prova precedente')); dopo.setAttribute('aria-label', t('rv_source_next_proof', 'Prova successiva'));
                    conta.setAttribute('aria-live', 'polite');
                    const vai = n => { i = (n + lista.length) % lista.length; conta.textContent = (nomi ? nomi[i] + ' · ' : t('rv_source_proof', 'Prova') + ' ') + (i + 1) + ' / ' + lista.length; vaiA(lista[i].pagina, lista[i].prova.text); };
                    prima.onclick = () => vai(i - 1); dopo.onclick = () => vai(i + 1);
                    prove.append(prima, conta, dopo);
                    disegna();
                    conta.textContent = (nomi ? nomi[0] + ' · ' : t('rv_source_proof', 'Prova') + ' ') + '1 / ' + lista.length;
                } else if (lista.length > 1 || (nomi && lista.length === 1)) lista.forEach((x, i) => {
                    /* con la foto anche UNA prova ha il suo bottone: dopo «×» serve per tornarci */
                    const b = crea('button', 'pm-btn-cancel', nomi ? nomi[i] : t('rv_source_proof', 'Prova') + ' ' + (i + 1)); b.type = 'button';
                    b.setAttribute('aria-pressed', String(i === 0));
                    b.onclick = () => { prove.querySelectorAll('button').forEach((x2, j) => x2.setAttribute('aria-pressed', String(j === i))); vaiA(x.pagina, x.prova.text); };
                    prove.appendChild(b);
                });
                /* giro 10: «×» in fondo alla riga — spegne la selezione (nessun bottone
                   premuto, nessun segno) e mostra la scheda intera (`vaiA(null)`, che con
                   la foto scrive `testoIntero`). Un bottone di blocco riporta al blocco. */
                if (barraFonte({ immagine: !!immagine, prove: lista.length }).chiudi) {
                    const x = crea('button', 'pm-btn-cancel mrv-fonte-chiudi', '×'); x.type = 'button';
                    x.setAttribute('aria-label', t('rv_scheda_intera', 'Mostra la scheda intera')); x.title = t('rv_scheda_intera', 'Mostra la scheda intera');
                    x.setAttribute('aria-pressed', 'false');
                    x.onclick = () => {
                        prove.querySelectorAll('button[aria-pressed]').forEach(b2 => b2.setAttribute('aria-pressed', String(b2 === x)));
                        corrente = null;
                        vaiA(null, '');
                    };
                    prove.appendChild(x);
                }
                vaiA(lista.length ? lista[0].pagina : null, lista.length ? lista[0].prova.text : '');
                return lista.length;
            },
            pagine: () => indice.slice(),
            smonta() { chiuso = true; richiesta++; if (v) v.smonta(); documenti.forEach(p => p.then(d => d && d.destroy && d.destroy()).catch(() => {})); host.replaceChildren(); }
        };
    }

    return { indicePagine, trovaPdf, trovaFoto, paginaPer, segmenti, rettangoli, barraFonte, testoIntero, eCitazione, coloreSegno, contrasto, monta };
}));
