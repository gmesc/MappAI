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
