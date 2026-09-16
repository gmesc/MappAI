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
    /* La pagina di una prova. `prova` può essere una prova del controllo
       ({ text, title|source, page, sourceId }), una citazione ({ docId, title,
       page, text }) o un chunk ({ source: 'pagina 3', text }). Vince la pagina
       che CONTIENE il testo; altrimenti documento e numero di pagina. */
    function paginaPer(prova, indice) {
        if (!prova || !Array.isArray(indice) || !indice.length) return null;
        const titolo = testo(prova.title || (typeof prova.source === 'string' && !/^pagina\s+\d+$/i.test(prova.source) ? prova.source : ''));
        const numero = Number(prova.page || (testo(prova.source).match(/(?:pag(?:ina|e)?\.?|p\.)\s*(\d+)/i) || [])[1] || 0);
        let pool = indice;
        const restringi = f => { const r = pool.filter(f); if (r.length) pool = r; return r.length > 0; };
        const perDoc = prova.docId ? restringi(p => p.docId === prova.docId) : false;
        if (!perDoc && titolo) restringi(p => p.title === titolo || chiave(p.title) === chiave(titolo));
        if (numero) restringi(p => p.page === numero);
        const citato = testo(prova.text).trim();
        if (citato && G && typeof G.originalExcerpt === 'function') {
            const con = pool.find(p => G.originalExcerpt(p.text, citato) !== null) || indice.find(p => G.originalExcerpt(p.text, citato) !== null);
            if (con) return con;
        }
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

    // ── il visore PDF (dal Banco) ───────────────────────────────────────────────
    function visore(viewer, canvas, stato, adatta, avvisa) {
        const C = globalThis.MappAIProiezioneCore;
        let page = null, width = 1, height = 1, state = { z: 1, x: 0, y: 0 }, fitted = true, drag = null;
        let renderTask = null, renderVersion = 0, timer = null, rasterScale = 0;
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
            state = { z, x: (viewer.clientWidth - width * z) / 2, y: 0 };
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
            async mostra(pagina) {
                page = pagina;
                const base = page.getViewport({ scale: 1 }); width = base.width; height = base.height;
                canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
                fit(); clearTimeout(timer); await render();
            },
            fallito,
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
       Senza pdfjsLib, MappAIProiezioneCore o un PDF per la fonte, resta il testo. */
    function monta(host, opts) {
        opts = opts || {};
        const t = typeof opts.t === 'function' ? opts.t : (_k, f) => f;
        const indice = indicePagine(opts.sources || []);
        const crea = (tag, cls, txt) => { const el = document.createElement(tag); if (cls) el.className = cls; if (txt != null) el.textContent = txt; return el; };
        host.replaceChildren();
        host.setAttribute('aria-label', t('rv_source_panel', 'Fonte della segnalazione'));
        const testa = crea('header', 'mrv-fonte-testa');
        const titolo = crea('h3', null, t('rv_source_title', 'Fonte'));
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
        const riassunto = crea('summary', null, t('rv_source_text', 'Testo archiviato della pagina'));
        const righe = crea('p', 'mrv-fonte-righe'); righe.tabIndex = 0;
        note.append(riassunto, righe);
        const vuoto = crea('p', 'mrv-fonte-vuoto', t('rv_source_empty', 'Questa segnalazione non indica una pagina della fonte. Scegli una pagina dall’elenco.'));
        host.append(testa, viewer, note, vuoto);
        disegna();

        // elenco delle pagine, raggruppato per documento
        const gruppi = new Map();
        indice.forEach(p => {
            if (!gruppi.has(p.docId)) { const g = crea('optgroup'); g.label = p.title; gruppi.set(p.docId, g); }
            const o = crea('option', null, p.page ? t('rv_source_page_short', 'Pag.') + ' ' + p.page : p.title); o.value = p.id;
            gruppi.get(p.docId).appendChild(o);
        });
        gruppi.forEach(g => scelta.appendChild(g));
        scelta.hidden = !indice.length;

        const pdfPronto = !!(globalThis.pdfjsLib && globalThis.MappAIProiezioneCore && typeof opts.leggiPdf === 'function');
        const v = pdfPronto ? visore(viewer, canvas, stato, adatta, t) : null;
        const documenti = new Map();      // titolo → Promise<PDFDocumentProxy|null>
        let corrente = null, citazione = '', richiesta = 0, proveAttive = [], chiuso = false;

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
            if (si) note.open = true;
        }
        async function vaiA(pagina, frase) {
            if (chiuso) return;
            const id = ++richiesta;
            vuoto.hidden = !!pagina; note.hidden = !pagina;
            if (!pagina) { soloTesto(true); viewer.hidden = true; return; }
            scelta.value = pagina.id; citazione = frase || '';
            righe.replaceChildren(...segmenti(pagina.text, citazione).map(s => s.segnato ? crea('mark', null, s.t) : document.createTextNode(s.t)));
            const segno = righe.querySelector('mark');
            if (!v) { soloTesto(true); if (segno && segno.scrollIntoView) segno.scrollIntoView({ block: 'center' }); return; }
            if (corrente && corrente.id === pagina.id) return;
            corrente = pagina;
            v.caricamento(); soloTesto(false); note.open = false;
            const doc = await documento(pagina.title);
            if (id !== richiesta || chiuso) return;
            if (!doc) { soloTesto(true); corrente = null; return; }
            try {
                const numero = Math.min(Math.max(1, pagina.page || 1), doc.numPages);
                const p = await doc.getPage(numero);
                if (id !== richiesta || chiuso) return;
                await v.mostra(p);
                scelta.title = pagina.title + ' · ' + t('rv_page', 'Pagina') + ' ' + numero + ' / ' + doc.numPages;
            } catch (error) { if (id === richiesta) { v.fallito(error); note.open = true; } }
        }
        scelta.addEventListener('change', () => { corrente = null; vaiA(indice.find(p => p.id === scelta.value), ''); });

        return {
            /* Le prove di una segnalazione (o una sola). Mostra la prima che ha una
               pagina; con più prove compaiono i bottoni «Prova 1, 2…». */
            mostra(elenco) {
                const viste = new Set();
                const lista = (Array.isArray(elenco) ? elenco : [elenco]).filter(Boolean)
                    .map(prova => ({ prova, pagina: paginaPer(prova, indice) })).filter(x => x.pagina)
                    .filter(x => { const k = x.pagina.id + '|' + testo(x.prova.text).replace(/\s+/g, ' ').slice(0, 120); if (viste.has(k)) return false; viste.add(k); return true; });
                const firma = lista.map(x => x.pagina.id + '|' + testo(x.prova.text).slice(0, 80)).join('§');
                if (firma && firma === proveAttive.firma) return;
                proveAttive = lista; proveAttive.firma = firma;
                prove.replaceChildren();
                /* Fino a quattro prove, un bottone ciascuna; oltre (una sezione di
                   sintesi ne cita anche 17) uno scorritore, che non riempie la testata. */
                if (lista.length > 4) {
                    let i = 0;
                    const prima = icona(crea('button', 'pm-btn-cancel mrv-icona'), 'chevron-left'), dopo = icona(crea('button', 'pm-btn-cancel mrv-icona'), 'chevron-right'), conta = crea('span', 'mrv-fonte-conta');
                    prima.type = dopo.type = 'button';
                    prima.setAttribute('aria-label', t('rv_source_prev_proof', 'Prova precedente')); dopo.setAttribute('aria-label', t('rv_source_next_proof', 'Prova successiva'));
                    conta.setAttribute('aria-live', 'polite');
                    const vai = n => { i = (n + lista.length) % lista.length; conta.textContent = t('rv_source_proof', 'Prova') + ' ' + (i + 1) + ' / ' + lista.length; vaiA(lista[i].pagina, lista[i].prova.text); };
                    prima.onclick = () => vai(i - 1); dopo.onclick = () => vai(i + 1);
                    prove.append(prima, conta, dopo);
                    disegna();
                    conta.textContent = t('rv_source_proof', 'Prova') + ' 1 / ' + lista.length;
                } else if (lista.length > 1) lista.forEach((x, i) => {
                    const b = crea('button', 'pm-btn-cancel', t('rv_source_proof', 'Prova') + ' ' + (i + 1)); b.type = 'button';
                    b.setAttribute('aria-pressed', String(i === 0));
                    b.onclick = () => { prove.querySelectorAll('button').forEach((x2, j) => x2.setAttribute('aria-pressed', String(j === i))); vaiA(x.pagina, x.prova.text); };
                    prove.appendChild(b);
                });
                return vaiA(lista.length ? lista[0].pagina : null, lista.length ? lista[0].prova.text : '');
            },
            pagine: () => indice.slice(),
            smonta() { chiuso = true; richiesta++; if (v) v.smonta(); documenti.forEach(p => p.then(d => d && d.destroy && d.destroy()).catch(() => {})); host.replaceChildren(); }
        };
    }

    return { indicePagine, trovaPdf, paginaPer, segmenti, monta };
}));
