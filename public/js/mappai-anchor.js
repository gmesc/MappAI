// ══════════════════════════════════════════════════════════════════════════
// MappAI — Anchor (cucitura fra `mappai-anchor-core.js` e appState)
// ══════════════════════════════════════════════════════════════════════════
//
// Gira UNA volta a fine generazione, dopo che l'albero è definitivo. Zero
// chiamate all'AI. Fa cinque cose, tutte deterministiche:
//   1. dà a ogni nodo le frasi VERE della fonte che lo sostengono (`sourcesDict`);
//   2. misura la fedeltà di ogni desc contro il testo della fonte;
//   3. conta la copertura: quali frasi del PDF non sono finite in nessun nodo;
//   4. declassa i nessi causali cronologicamente impossibili;
//   5. toglie dalle desc il metatesto (saluti, «questo ramo è a parte», confini).
//
// Il risultato sta in `appState._qualityReport`, che il rapporto di generazione
// mostra al docente PRIMA che stampi.
//
// Kill-switch: localStorage `mappai_anchor_enabled` = '0'.
(function () {
    'use strict';

    function _state() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }
    function _acceso() {
        try { return localStorage.getItem('mappai_anchor_enabled') !== '0'; } catch (e) { return true; }
    }

    /* Le pagine di questa generazione. Con un PDF arrivano da `extractPdfPages`
       (numerate); con testo incollato o un URL non ci sono pagine e si ripiega
       sul contenuto delle fonti, pagina 0 — la copertura si conta lo stesso, si
       perde solo il «a pagina N» nelle citazioni. */
    function _pagine() {
        const st = _state();
        const A = window.MappAIAnchorCore;
        const da = st && st._pdfPagine;
        if (Array.isArray(da) && da.length) {
            const out = [];
            da.forEach(f => (f.pages || []).forEach(p => out.push({ n: p.n, text: p.text, fonte: f.nome })));
            if (out.length) return out;
        }
        const testi = ((st && st.sources) || []).map(s => s && s.content).filter(t => t && t.trim());
        return testi.length ? A.paginePiatte(testi) : [];
    }

    function _nomeFonte(pagine) {
        const f = pagine.find(p => p.fonte);
        return (f && f.fonte) || 'Fonte';
    }

    window.applyAnchor = function () {
        const A = window.MappAIAnchorCore;
        const st = _state();
        if (!A || !st || !st.db || !Array.isArray(st.db.nodes)) return null;
        if (!_acceso()) { console.log('[Anchor] spento dal kill-switch'); return null; }

        const pagine = _pagine();
        if (!pagine.length) { console.log('[Anchor] nessun testo sorgente: niente da ancorare'); return null; }

        const frasi = A.frasiDaPagine(pagine);
        const nodi = st.db.nodes;
        const corpus = pagine.map(p => p.text).join('\n');
        const titolo = _nomeFonte(pagine);

        // 1 ── le citazioni vere -------------------------------------------------
        const anc = A.ancoraNodi(nodi, frasi);
        st.db.sourcesDict = st.db.sourcesDict || {};
        let ancorati = 0, parafrasi = 0;
        nodi.forEach(n => {
            const q = anc.perNodo[n.id];
            if (q && q.length) {
                st.db.sourcesDict[n.id] = q.map(x => ({
                    title: titolo,
                    source: x.page ? ('pagina ' + x.page) : 'fonte',
                    text: x.text,
                    verbatim: true
                }));
                /* `chunks` è ciò che il vault scrive nella sezione «## Fonti» del
                   markdown del nodo, ed è da lì che `sourcesDict` si ricostruisce
                   alla riapertura: è QUESTO che rende la citazione permanente
                   invece che viva solo in memoria.
                   ⚠️ Oggetti, non stringhe: il formato su disco è
                   `- [titolo | fonte]: testo`, quindi con le stringhe si
                   perderebbe la PAGINA. È anche la forma che il caricatore del
                   vault produce già oggi (main.js, parser di «## Fonti»). */
                n.chunks = q.map(x => ({
                    title: titolo,
                    source: x.page ? ('pagina ' + x.page) : 'fonte',
                    text: x.text
                }));
                ancorati++;
            } else {
                /* Nessuna frase abbastanza vicina: si LASCIA il ripiego che c'era
                   (la desc), ma lo si ETICHETTA. Prima nessuno poteva distinguere
                   una citazione da una parafrasi, e la sintesi le numerava tutte
                   come «Fonti»: 1.215 parole di virgolettati che ripetevano il
                   testo appena letto. */
                const g = st.db.sourcesDict[n.id];
                if (Array.isArray(g)) {
                    g.forEach(e => { if (e && !e.verbatim) { e.parafrasi = true; parafrasi++; } });
                }
            }
        });

        // 2 ── fedeltà -----------------------------------------------------------
        const fed = A.fedelta(nodi, corpus, window.MappAIDescFidelity);

        // 3 ── copertura ---------------------------------------------------------
        const cop = A.copertura(frasi, anc.usate);

        // 4 ── nessi impossibili -------------------------------------------------
        const tutti = A.nessiImpossibili(nodi, st.db.links || []);
        const sospetti = tutti.filter(s => s.livello === 'impossibile');
        const daVerificare = tutti.filter(s => s.livello === 'da verificare');
        const idOf = x => (x && typeof x === 'object') ? x.id : x;
        // si tocca SOLO l'impossibile; l'ambiguo si racconta e basta
        sospetti.forEach(s => {
            (st.db.links || []).forEach(l => {
                if (idOf(l.source) === s.source && idOf(l.target) === s.target && l.rel === s.rel) {
                    /* il collegamento RESTA (togliere un arco cambierebbe l'albero):
                       cade solo il verbo, che è la parte non vera. L'originale si
                       conserva, così ELABORA può mostrarlo al docente. */
                    l._relOriginale = l.rel;
                    l.rel = l.isCross ? 'correlato a' : 'include';
                }
            });
        });

        // 5 ── metatesto ---------------------------------------------------------
        let ripulite = 0; const esempiMeta = [];
        nodi.forEach(n => {
            if (!n.desc) return;
            const r = A.togliMeta(n.desc);
            if (r.tolte.length && r.text.trim().length > 20) {
                n.desc = r.text;
                ripulite++;
                r.tolte.forEach(t => { if (esempiMeta.length < 5) esempiMeta.push(t); });
            }
        });

        const rep = {
            quando: new Date().toISOString(),
            frasi: frasi.length,
            ancorati: ancorati,
            senzaCitazione: nodi.length - ancorati,
            parafrasiEtichettate: parafrasi,
            copertura: cop,
            fedelta: fed,
            nessiDeclassati: sospetti,
            nessiDaVerificare: daVerificare,
            metaRipulite: ripulite,
            esempiMeta: esempiMeta
        };
        st._qualityReport = rep;

        console.log('[Anchor] ' + ancorati + '/' + nodi.length + ' nodi con una citazione vera · '
            + 'copertura fonte ' + cop.pct + '%'
            + (fed ? ' · fedeltà media ' + fed.media + ' (' + fed.sotto.length + ' sotto soglia)' : '')
            + (sospetti.length ? ' · ' + sospetti.length + ' nessi declassati' : '')
            + (ripulite ? ' · ' + ripulite + ' desc ripulite dal metatesto' : ''));
        cop.pagine.filter(p => p.pct < 40 && p.tot >= 3).forEach(p => {
            console.warn('[Anchor] pagina ' + (p.page || '?') + ' coperta al ' + p.pct + '% ('
                + p.coperte + '/' + p.tot + ' frasi): il contenuto di quella parte non è in mappa');
        });
        return rep;
    };

    /* ── IL RERANKER DI INFOMANIAK SCEGLIE LE CITAZIONI (16/9/26) ─────────────
       Dopo l'àncora, per ogni nodo chiede a BAAI/bge-reranker-v2-m3 quali frasi
       della fonte lo sostengono, e tiene le prime due. I numeri che giustificano
       la sostituzione (86% di frasi giuste contro il 72% dell'àncora, giudicate a
       mano) e l'assenza di soglie stanno in mappai-anchor-core.js, accanto a
       `citazioniDaVoti`.

       QUANDO. `finalizeMindMapQuality` la chiama quando le descrizioni sono
       definitive e PRIMA del giudice, che legge proprio queste citazioni.

       ANCHE CON GOOGLE GEMINI. Le credenziali sono quelle di Infomaniak, lette
       senza guardare il provider della generazione (richiesta di Giacomo, 16/9).

       ⚠️ SPENTO DI DEFAULT: manda a un secondo fornitore le frasi della fonte e le
       descrizioni dei nodi, quindi lo accende chi usa l'app, in Configurazione AI.
       Kill-switch: localStorage `mappai_reranker_infomaniak` = '1' acceso.

       ⚠️ UNA CHIAMATA PER NODO, una al secondo: l'API ammette 60 richieste al
       minuto. Una mappa da 46 nodi aggiunge circa un minuto. Se una chiamata
       fallisce (token, rete) la fase si ferma e i nodi non ancora visti tengono
       le citazioni dell'àncora: niente resta a metà dentro un nodo. */
    const RERANK_PAUSA_MS = 1050;
    const _dormi = ms => new Promise(r => setTimeout(r, ms));
    function _rerankerAcceso() {
        try { return localStorage.getItem('mappai_reranker_infomaniak') === '1'; } catch (e) { return false; }
    }
    function _leggi(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
    function _credenzialiInfomaniak() {
        const st = _state() || {};
        const campoT = document.getElementById('infomaniak-api-key-input');
        const campoP = document.getElementById('infomaniak-product-id');
        const token = (campoT && campoT.value.trim()) || (window.secureKeys && window.secureKeys['infomaniak_api_key']) || _leggi('infomaniak_api_key');
        const prodotto = (campoP && campoP.value.trim()) || st.infomaniakProductId || _leggi('infomaniak_product_id');
        return { token: String(token || '').trim(), prodotto: String(prodotto || '').trim() };
    }
    window.isRerankerEnabled = _rerankerAcceso;

    window.applyRerankerCitations = async function () {
        const A = window.MappAIAnchorCore;
        const st = _state();
        const rep = { stato: 'saltato', motivo: '', nodi: 0, esaminati: 0, cambiati: 0, token: 0, secondi: 0 };
        if (st) st._rerankerReport = rep;
        const salta = motivo => { rep.motivo = motivo; console.log('[Reranker] saltato: ' + motivo); return rep; };
        if (!_rerankerAcceso()) return salta('spento (Configurazione AI › Infomaniak)');
        if (!A || !A.citazioniDaVoti || !st || !st.db || !Array.isArray(st.db.nodes)) return salta('modulo non disponibile');
        if (!_acceso()) return salta('àncora spenta');
        if (!window.electronAPI || !window.electronAPI.rerankInfomaniak) return salta('serve l\'app desktop');
        const cred = _credenzialiInfomaniak();
        if (!cred.token) return salta('manca il token Infomaniak');
        if (!/^\d+$/.test(cred.prodotto)) return salta('manca il Product ID Infomaniak');
        const pagine = _pagine();
        const frasi = pagine.length ? A.frasiDaPagine(pagine) : [];
        if (!frasi.length) return salta('nessuna frase della fonte');
        const titolo = _nomeFonte(pagine);
        const nodi = st.db.nodes.filter(n => n && n.id && String(n.desc || n.content || '').trim());
        rep.stato = 'in-corso';
        rep.nodi = nodi.length;
        const inizio = Date.now();
        const nascondi = m => String(m || '').split(cred.token).join('«token»');

        for (let k = 0; k < nodi.length; k++) {
            const n = nodi[k];
            if (window.showLoadingOverlay) {
                window.showLoadingOverlay(true, (window.t ? window.t('lo_reranker', 'Scelgo le frasi della fonte con il reranker…') : 'Scelgo le frasi della fonte con il reranker…') + ' ' + (k + 1) + '/' + nodi.length);
            }
            if (k) await _dormi(RERANK_PAUSA_MS);
            const indici = A.candidatiReranker(frasi, n);
            const richiesta = { apiKey: cred.token, productId: cred.prodotto, query: A.queryReranker(n), documents: indici.map(i => frasi[i].text) };
            let r = await window.electronAPI.rerankInfomaniak(richiesta);
            if (r && r.ok === false && r.status === 429) {
                await _dormi(Math.max(r.retryAfter || 0, 61) * 1000);
                r = await window.electronAPI.rerankInfomaniak(richiesta);
            }
            if (!r || r.ok === false) {
                rep.stato = 'interrotto';
                rep.motivo = 'HTTP ' + ((r && r.status) || '?') + ': ' + nascondi(r && r.message);
                console.warn('[Reranker] interrotto al nodo ' + (k + 1) + '/' + nodi.length + ' — ' + rep.motivo + '. I nodi restanti tengono le citazioni dell\'àncora.');
                break;
            }
            rep.esaminati++;
            rep.token += (r.usage && Number(r.usage.total_tokens)) || 0;
            const cit = A.citazioniDaVoti(frasi, indici, r.scores);
            if (!cit.length) continue;   // la fonte non parla di questo nodo: resta quello che c'era
            st.db.sourcesDict = st.db.sourcesDict || {};
            const prima = JSON.stringify(((st.db.sourcesDict[n.id] || []).filter(c => c && c.verbatim)).map(c => c.text));
            const fonte = x => (x.page ? ('pagina ' + x.page) : 'fonte');
            st.db.sourcesDict[n.id] = cit.map(x => ({ title: titolo, source: fonte(x), text: x.text, verbatim: true }));
            n.chunks = cit.map(x => ({ title: titolo, source: fonte(x), text: x.text }));
            if (prima !== JSON.stringify(cit.map(x => x.text))) rep.cambiati++;
        }
        if (rep.stato === 'in-corso') rep.stato = 'completato';
        rep.secondi = Math.round((Date.now() - inizio) / 1000);

        /* La copertura e il conto dei nodi citati descrivevano le citazioni
           dell'àncora: si ricontano su quelle di adesso, così il rapporto che il
           docente legge e il giudice parlano delle stesse frasi. */
        const qr = st._qualityReport;
        if (qr && rep.esaminati) {
            const perTesto = new Map(frasi.map(f => [f.text, f.idx]));
            const usate = {};
            let citati = 0;
            st.db.nodes.forEach(n => {
                const vere = ((st.db.sourcesDict || {})[n.id] || []).filter(c => c && c.verbatim);
                if (vere.length) citati++;
                vere.forEach(c => { if (perTesto.has(c.text)) usate[perTesto.get(c.text)] = 1; });
            });
            qr.copertura = A.copertura(frasi, usate);
            qr.ancorati = citati;
            qr.senzaCitazione = st.db.nodes.length - citati;
        }
        console.log('[Reranker] ' + rep.stato + ' · ' + rep.esaminati + '/' + rep.nodi + ' nodi letti · ' + rep.cambiati + ' con citazioni diverse dall\'àncora · '
            + rep.token + ' token (~CHF ' + (rep.token * 0.01 / 1e6).toFixed(4) + ') · ' + rep.secondi + ' s');
        return rep;
    };

    /* Righe pronte per il rapporto di generazione che il docente vede. Testo, non
       oggetti: chi lo stampa non deve conoscere la forma del rapporto. */
    window.anchorReportLines = function () {
        const r = (_state() || {})._qualityReport;
        if (!r) return [];
        const out = [];
        out.push('Citazioni dalla fonte: ' + r.ancorati + ' nodi su ' + (r.ancorati + r.senzaCitazione));
        out.push('Copertura della fonte: ' + r.copertura.pct + '% delle frasi è finita in un nodo');
        const scoperte = r.copertura.pagine.filter(p => p.pct < 40 && p.tot >= 3);
        if (scoperte.length) {
            out.push('Parti quasi assenti dalla mappa: ' + scoperte.map(p => 'pagina ' + (p.page || '?') + ' (' + p.pct + '%)').join(', '));
        }
        if (r.fedelta) {
            out.push('Fedeltà media delle descrizioni: ' + r.fedelta.media
                + (r.fedelta.sotto.length ? ' — ' + r.fedelta.sotto.length + ' sotto soglia, da rileggere' : ''));
        }
        if ((r.nessiDaVerificare || []).length) {
            out.push('Nessi causali da verificare (la causa si estende oltre l\'effetto): ' + r.nessiDaVerificare
                .map(s => '«' + s.causa + '» (fino al ' + s.annoCausa + ') → ' + s.rel + ' → «' + s.effetto + '» (' + s.annoEffetto + ')')
                .join(' · '));
        }
        if (r.nessiDeclassati.length) {
            out.push('Nessi causali impossibili, declassati: ' + r.nessiDeclassati
                .map(s => '«' + s.causa + '» (' + s.annoCausa + ') → ' + s.rel + ' → «' + s.effetto + '» (' + s.annoEffetto + ')')
                .join(' · '));
        }
        if (r.metaRipulite) out.push('Descrizioni ripulite dal metatesto: ' + r.metaRipulite);
        const rr = (_state() || {})._rerankerReport;
        if (rr && rr.esaminati) {
            out.push('Citazioni scelte dal reranker Infomaniak: ' + rr.esaminati + (rr.esaminati === 1 ? ' nodo su ' : ' nodi su ') + rr.nodi + ', '
                + rr.cambiati + (rr.cambiati === 1 ? ' diversa' : ' diverse') + ' da quelle dell\'àncora'
                + (rr.stato === 'interrotto' ? ' — interrotto (' + rr.motivo + '): gli altri nodi tengono le citazioni dell\'àncora' : ''));
        } else if (rr && rr.stato === 'saltato' && rr.motivo && !/^spento/.test(rr.motivo)) {
            out.push('Reranker Infomaniak acceso ma non partito: ' + rr.motivo);
        }
        /* Il verdetto del giudice entra nelle stesse righe: per il docente è una
           cosa sola — che cosa sa il programma di questa mappa prima che la
           stampi. Le misure qui sopra restano quelle di PRIMA del giudice, ed è
           voluto: sono i numeri su cui il giudice ha lavorato. */
        try {
            const g = (_state() || {})._giudiceReport;
            if (g && g.rami) {
                if (g.correzioni.length) {
                    out.push(g.applicaAcceso
                        ? ('Errori di senso corretti dal controllo: ' + g.applicate + ' — ' +
                           g.correzioni.slice(0, 3).map(c => '«' + c.label + '» ' + c.tipo).join(', '))
                        : ('Errori di senso trovati dal controllo (non corretti, le scritture sono spente): ' +
                           g.correzioni.length + ' — ' + g.correzioni.slice(0, 3).map(c => '«' + c.label + '» ' + c.tipo).join(', ')));
                }
                if (g.segnalati.length) out.push('Descrizioni da rileggere secondo il controllo: ' + g.segnalati.length);
                if (g.linkTolti.length) out.push('Nessi non sostenuti dalla fonte: ' + g.linkTolti.length);
            }
        } catch (e) { /* il rapporto del giudice è un di più */ }
        return out;
    };

    console.log('[MappAIAnchor] àncora caricata');
})();
