/**
 * mis-struct-core — metriche di grafo e di granularità dei blocchi.
 *
 * Le definizioni qui dentro sono CALIBRATE sui vault reali (research.md R1):
 * riproducono esattamente i 18 valori strutturali e le 8 righe di parole per
 * nodo dell'assessment del 24/07/2026. Cambiarle senza rifare la calibrazione
 * rompe tests/riferimento-2026.test.js, che è esattamente il suo mestiere.
 *
 * Puro: niente DOM, niente rete, niente Electron, nessuna data implicita.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MisStructCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /**
     * Nodo markdown del vault → oggetto.
     *
     * ⚠️ DEFINIZIONE CALIBRATA: il corpo è tutto ciò che segue il frontmatter
     * YAML MENO la riga del titolo markdown «# Etichetta». Includendo il titolo
     * ogni cifra si sposta di 2-3 parole e nessuna combacia più con
     * l'assessment del 2026 (verificato: 1A passa da 42,4 a 44,9 parole medie).
     */
    function parseNode(rawMd, nomeFile) {
        const raw = String(rawMd || '');
        const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
        const fmRaw = m ? m[1] : '';
        const dopoFm = m ? m[2] : raw;

        const fm = {};
        fmRaw.split(/\r?\n/).forEach((riga) => {
            const mm = riga.match(/^(\w+):\s*(.*)$/);
            if (mm) fm[mm[1]] = String(mm[2]).replace(/^"|"$/g, '').trim();
        });

        // Rimuove SOLO la prima riga di titolo di livello 1.
        const corpo = dopoFm.replace(/^\s*#\s+.*$/m, '').trim();

        return {
            file: nomeFile || '',
            id: fm.id || '',
            label: fm.label || '',
            level: fm.level === undefined || fm.level === '' ? null : Number(fm.level),
            parent: fm.parent || null,
            group: fm.group === undefined || fm.group === '' ? null : Number(fm.group),
            corpo,
        };
    }

    // links.json può essere un array oppure { links: [...] }. Un link senza
    // `rel` vale 'include' — DAL Protocol, principio V della costituzione.
    function normalizeLinks(grezzi) {
        let arr = grezzi;
        if (arr && !Array.isArray(arr) && Array.isArray(arr.links)) arr = arr.links;
        if (!Array.isArray(arr)) return [];
        return arr.map((l) => ({
            source: typeof l.source === 'object' && l.source ? l.source.id : l.source,
            target: typeof l.target === 'object' && l.target ? l.target.id : l.target,
            rel: String(l.rel == null || l.rel === '' ? 'include' : l.rel).trim(),
            bidirectional: !!l.bidirectional,
        }));
    }

    function graphMetrics(nodi, linksGrezzi) {
        const links = normalizeLinks(linksGrezzi);
        const perLivello = {};
        nodi.forEach((n) => {
            if (n.level === null || isNaN(n.level)) return;
            perLivello[n.level] = (perLivello[n.level] || 0) + 1;
        });
        const livelli = Object.keys(perLivello).map(Number);

        const rels = links.map((l) => l.rel.toLowerCase());
        const distinti = Array.from(new Set(rels)).sort();
        const generici = rels.filter((r) => r === 'include').length;

        return {
            nodiTotali: nodi.length,
            perLivello,
            macroAree: perLivello[1] || 0,
            profonditaMax: livelli.length ? Math.max.apply(null, livelli) : null,
            links: links.length,
            relDistinte: distinti.length,
            relElenco: distinti,
            relRicchi: rels.length - generici,
            genericiPct: rels.length ? +(generici / rels.length * 100).toFixed(1) : null,
        };
    }

    // ⚠️ Deviazione standard DI POPOLAZIONE (÷n), non campionaria (÷n−1):
    // è quella che riproduce 9,7 e 7,8 dell'assessment del 2026.
    function _stat(valori) {
        const n = valori.length;
        if (!n) return null;
        const somma = valori.reduce((a, b) => a + b, 0);
        const media = somma / n;
        const varianza = valori.reduce((a, b) => a + (b - media) * (b - media), 0) / n;
        return {
            n,
            media: +media.toFixed(1),
            min: Math.min.apply(null, valori),
            max: Math.max.apply(null, valori),
            devStd: +Math.sqrt(varianza).toFixed(1),
            totale: somma,
        };
    }

    function wordsPerNode(nodi, tokenize) {
        const perLivello = {};
        const tutte = [];
        nodi.forEach((n) => {
            const c = tokenize(n.corpo).length;
            tutte.push(c);
            const k = n.level === null || isNaN(n.level) ? 'senza' : String(n.level);
            (perLivello[k] = perLivello[k] || []).push(c);
        });
        const out = { perLivello: {}, tutti: _stat(tutte) };
        Object.keys(perLivello).forEach((k) => { out.perLivello[k] = _stat(perLivello[k]); });
        return out;
    }

    /**
     * Piano strutturale del componente 8: quota di legami che dichiarano un
     * nesso logico (causale, condizionale, oppositivo) invece di limitarsi
     * alla gerarchia.
     *
     * `edgeFamilies` è INIETTATO e non importato: è ciò che permette a
     * tests/riuso-divergenza.test.js di passare due tassonomie diverse e
     * accorgersi che la copia da MappAI è invecchiata (research.md R6).
     */
    function causalStructure(linksGrezzi, edgeFamilies) {
        const links = normalizeLinks(linksGrezzi);
        if (!links.length) {
            return { quotaLegamiLogici: null, motivo: 'nessun legame', perFamiglia: {}, totale: 0 };
        }
        const perFamiglia = {};
        let logici = 0;
        links.forEach((l) => {
            const fam = edgeFamilies.famigliaDi(l.rel);
            perFamiglia[fam] = (perFamiglia[fam] || 0) + 1;
            if (edgeFamilies.isLogica(l.rel)) logici++;
        });
        return {
            quotaLegamiLogici: +(logici / links.length * 100).toFixed(1),
            legamiLogici: logici,
            totale: links.length,
            perFamiglia,
            motivo: null,
        };
    }

    // ── Ridondanza fra nodi fratelli (alimenta il fattore di sostanza) ──────
    function _ngrammi(testo, dim, tokenize) {
        const w = tokenize(testo).map((x) => x.toLowerCase());
        const out = new Set();
        for (let i = 0; i + dim <= w.length; i++) out.add(w.slice(i, i + dim).join(' '));
        return out;
    }

    function _jaccard(a, b) {
        if (!a.size || !b.size) return 0;
        let inter = 0;
        a.forEach((x) => { if (b.has(x)) inter++; });
        return inter / (a.size + b.size - inter);
    }

    function siblingRedundancy(nodi, linksGrezzi, opts) {
        const o = opts || {};
        const dim = o.ngramDim || 4;
        const tokenize = o.tokenize;
        const links = normalizeLinks(linksGrezzi);

        // Fratelli = nodi che condividono il genitore. Il genitore si legge dal
        // frontmatter quando c'è, altrimenti si ricava dai link entranti.
        const genitoreDi = {};
        nodi.forEach((n) => { if (n.parent) genitoreDi[n.id] = n.parent; });
        links.forEach((l) => { if (!genitoreDi[l.target]) genitoreDi[l.target] = l.source; });

        const gruppi = {};
        nodi.forEach((n) => {
            const g = genitoreDi[n.id];
            if (!g) return;
            (gruppi[g] = gruppi[g] || []).push(n);
        });

        const coppie = [];
        Object.keys(gruppi).sort().forEach((g) => {
            const f = gruppi[g];
            if (f.length < 2) return;
            const ng = f.map((n) => _ngrammi(n.corpo, dim, tokenize));
            for (let i = 0; i < f.length; i++) {
                for (let j = i + 1; j < f.length; j++) {
                    coppie.push({
                        a: f[i].label || f[i].id,
                        b: f[j].label || f[j].id,
                        sovrapposizione: +_jaccard(ng[i], ng[j]).toFixed(3),
                    });
                }
            }
        });

        if (!coppie.length) {
            return { mediaSovrapposizione: null, motivo: 'nessuna coppia di fratelli', coppiePiuSimili: [] };
        }
        const media = coppie.reduce((a, c) => a + c.sovrapposizione, 0) / coppie.length;
        return {
            mediaSovrapposizione: +media.toFixed(3),
            coppie: coppie.length,
            coppiePiuSimili: coppie.slice().sort((x, y) => y.sovrapposizione - x.sovrapposizione).slice(0, 5),
            motivo: null,
        };
    }

    return { parseNode, normalizeLinks, graphMetrics, wordsPerNode, causalStructure, siblingRedundancy };
}));
