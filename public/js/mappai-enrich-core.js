// ══════════════════════════════════════════════════════════════════════════
// MappAI — Enrich Core (motore del tab ELABORA / co-docente)
// ══════════════════════════════════════════════════════════════════════════
//
// Logica PURA (zero AI, zero mutazione, zero appState diretto) a supporto del
// tab ELABORA: il docente, DOPO aver generato una mappa, riceve un profilo
// DESCRITTIVO del materiale e card di arricchimento che citano la fonte
// VERBATIM. Nessun voto, nessuna riscrittura automatica — è l'opposto di
// enrichThinDescs (che muta node.desc in silenzio).
//
// Compone i moduli già esistenti (spec 012-co-docente):
//  - deepen-core (residuo dalla fonte, dedup, assegnazione globale)
//  - desc-fidelity (groundedness dei nodi vs corpus, corpus dallo stato)
//  - structure-analyzer (gap strutturali) → DELEGATO: è IIFE window-only e ha
//    già i suoi test; qui si legge in soft (assente in Node → structural = []).
//
// CHIUSURA GAP SENZA FABBRICAZIONE: opts.extraCorpus (testi/PDF che il docente
// aggiunge in ELABORA) viene unito al corpus-fonte → il residuo si ricalcola →
// nuove card che citano VERBATIM dal materiale aggiunto. La fonte, arricchita
// con materiale REALE, resta il giudice. L'AI non inventa contenuto.
//
// Test: tests/enrich-core.test.js
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./mappai-deepen-core.js'), require('./mappai-desc-fidelity.js'));
    } else {
        root.MappAIEnrichCore = factory(root.MappAIDeepenCore, root.MappAIDescFidelity);
    }
}(typeof self !== 'undefined' ? self : this, function (Deepen, Fidelity) {
    'use strict';

    const DEFAULTS = {
        poorGroundedness: 0.45,   // sotto = nodo poco ancorato alla fonte
        poorWordCount: 25,        // desc più corta = nodo "povero"
        maxResiduePerCard: 5,     // frasi-fonte mostrate per card (cap UI)
        maxCards: 24,             // card di copertura totali (cap UI)
        longSentence: 30          // parole: frase lunga (leggibilità BES/DSA)
    };

    const wc = s => (String(s || '').trim().match(/\S+/g) || []).length;
    const nodeText = n => ((n && n.desc && n.desc.trim()) ? n.desc : (n && n.content) || '');

    // ── Segnali di TESTO (deterministici, descrittivi) ──────────────────────
    // Metro lessicale su marcatori di superficie: PROFILO, non giudizio. Ogni
    // segnale porta un'osservazione + un suggerimento azionabile (FR-005), mai
    // un numero nudo. I marcatori distintivi (multi-parola) pesano; gli
    // ambigui monoparola (se/come/ma) sono inclusi ma il segnale resta un nudge.
    const CONNECTIVES = {
        causale: /\b(perch[eé]|poich[eé]|quindi|dunque|perci[oò]|pertanto|di conseguenza|cos[ìi] che|affinch[eé]|provoca|caus[ae]|deriva da|dipende da|grazie a|a causa di|per questo motivo|ne consegue|comporta|determina|innesc[ao]|rende possibile|permett[eo]no? di|consent[eo]no? di)\w*/gi,
        temporale: /\b(dapprima|poi|dopodich[eé]|infine|successivamente|nel frattempo|in seguito|a quel punto|contemporaneamente|finch[eé]|non appena|subito dopo|dopo di che|inizialmente)\w*/gi,
        avversativa: /\b(tuttavia|per[oò]|invece|anzi|bens[ìi]|al contrario|nonostante|sebbene|bench[eé]|eppure|d'altra parte|mentre invece)\w*/gi,
        condizionale: /\b(qualora|purch[eé]|a condizione che|nel caso in cui|ammesso che|se soltanto|a patto che)\w*/gi,
        esemplificativa: /\b(ad esempio|per esempio|come ad esempio|cio[eè]|ossia|vale a dire|in particolare|tra cui|ad esempio)\w*/gi
    };

    function analyzeTextSignals(corpus, opts) {
        const o = Object.assign({}, DEFAULTS, opts);
        const text = String(corpus || '');
        const words = wc(text);
        const sentences = Deepen.splitSentences(text);
        const contentW = Deepen.contentWords(text);
        const uniqueContent = new Set(contentW).size;
        const per1000 = n => words ? +(n * 1000 / words).toFixed(1) : 0;

        const connectives = {};
        Object.keys(CONNECTIVES).forEach(k => {
            const m = text.match(CONNECTIVES[k]);
            connectives[k] = { count: m ? m.length : 0, per1000: per1000(m ? m.length : 0) };
        });

        const avgSentenceWords = sentences.length ? +(words / sentences.length).toFixed(1) : 0;
        const lexicalDensity = words ? +(contentW.length / words).toFixed(2) : 0;      // parole-contenuto / totali
        const typeTokenRatio = contentW.length ? +(uniqueContent / contentW.length).toFixed(2) : 0;

        // ridondanza: frasi quasi-duplicate di una precedente (possibile SALIENZA, non rumore)
        let repeated = 0;
        const seen = [];
        for (const s of sentences) {
            if (wc(s) < 4) continue;
            if (seen.some(p => Deepen.jaccardSim(s, p) >= 0.6)) repeated++;
            else seen.push(s);
        }

        // ── osservazioni azionabili (conservative, descrittive) ──
        const signals = [];
        if (connectives.causale.per1000 < 4) {
            signals.push({ key: 'causal_low', value: connectives.causale.count, level: 'notice',
                observation: 'Pochi nessi causali espliciti.',
                suggestion: 'Se il tema è un processo o una catena di cause-effetti, rendere espliciti i legami (perché, quindi, di conseguenza) aiuta chi ha poche preconoscenze.' });
        }
        if (connectives.esemplificativa.count === 0) {
            signals.push({ key: 'examples_none', value: 0, level: 'notice',
                observation: 'Nessun esempio esplicito rilevato.',
                suggestion: 'Un esempio concreto ancora un concetto astratto: valuta di aggiungerne per i punti più difficili.' });
        }
        if (avgSentenceWords > o.longSentence) {
            signals.push({ key: 'sentences_long', value: avgSentenceWords, level: 'notice',
                observation: 'Frasi mediamente lunghe (' + avgSentenceWords + ' parole).',
                suggestion: 'Frasi più brevi riducono il carico di lettura per studenti BES/DSA.' });
        }
        if (repeated > 0) {
            signals.push({ key: 'redundancy', value: repeated, level: 'info',
                observation: repeated + ' frase/i ripetuta/e nel materiale.',
                suggestion: 'La ripetizione è spesso SALIENZA (segnala importanza), non rumore: verifica se è voluta prima di toglierla.' });
        }

        return {
            words, sentences: sentences.length, avgSentenceWords,
            lexicalDensity, typeTokenRatio, uniqueContentWords: uniqueContent,
            connectives, redundancy: repeated, signals
        };
    }

    // ── Copertura-FONTE: nodi poveri + residuo verbatim ─────────────────────
    // Usa desc-fidelity per l'ancoraggio e deepen-core.assignResidues per
    // assegnare GLOBALMENTE ogni frase-fonte al solo nodo più pertinente
    // (niente stessa frase in due card). Ritorna card con frasi VERBATIM.
    function analyzeCoverage(nodes, corpus, opts) {
        const o = Object.assign({}, DEFAULTS, opts);
        // level >= 1 esclude ROOT (il titolo della mappa non si arricchisce),
        // coerente con desc-fidelity.analyzeNodes che salta i nodi level < 1.
        const list = (nodes || []).filter(n => n && (n.level == null ? 0 : n.level) >= 1);
        const groundedness = Fidelity.analyzeNodes(list, corpus, { threshold: o.poorGroundedness });
        // analyzeNodes → null se il corpus è troppo magro per una metrica sensata
        // (<30 parole-contenuto uniche). In quel caso NON emettiamo card: la fonte
        // non basta a misurare l'ancoraggio, e produrre card word-count-only darebbe
        // un segnale incoerente (hasSource false ma card presenti). Gate unico e onesto.
        if (!groundedness) return { hasSource: false, groundedness: null, cards: [], cappedCards: false };
        const scoreById = {};
        groundedness.rows.forEach(r => { scoreById[r.id] = r.score; });

        const isPoor = n => {
            const g = scoreById[n.id];
            return (g != null && g < o.poorGroundedness) || wc(nodeText(n)) < o.poorWordCount;
        };

        // assegnazione globale: TUTTI competono; solo i poveri sono eligible (assorbitori gli altri)
        const competitors = list.map(n => ({
            id: n.id, parentText: (n.label || '') + ' ' + nodeText(n), eligible: isPoor(n)
        }));
        const residueByNode = Deepen.assignResidues(competitors, corpus);

        const byId = {}; list.forEach(n => { byId[n.id] = n; });
        let cards = [];
        for (const [id, material] of residueByNode) {
            const n = byId[id]; if (!n) continue;
            const nodeIdx = Deepen.buildCoverageIndex((n.label || '') + ' ' + nodeText(n));
            const residue = Deepen.splitSentences(material)
                .map(s => ({ text: s, newWords: Deepen.lexicalOverlap(s, nodeIdx).newWords.length }))
                .filter(s => s.text)
                .sort((a, b) => b.newWords - a.newWords)
                .slice(0, o.maxResiduePerCard);
            if (!residue.length) continue;
            cards.push({
                nodeId: id, label: n.label || '', level: n.level,
                wordCount: wc(nodeText(n)),
                groundedness: scoreById[id] != null ? scoreById[id] : null,
                residue,
                totalNewWords: residue.reduce((a, r) => a + r.newWords, 0)
            });
        }
        cards.sort((a, b) => b.totalNewWords - a.totalNewWords);
        const cappedCards = cards.length > o.maxCards;
        if (cappedCards) cards = cards.slice(0, o.maxCards);

        // groundedness qui è sempre valido (early-return sopra se null)
        return {
            hasSource: true,
            groundedness: { avg: groundedness.avg, below: groundedness.below, count: groundedness.count, worst: groundedness.worst },
            cards, cappedCards
        };
    }

    // ── Composizione: il verdetto completo per ELABORA ──────────────────────
    // state: appState-like { sources, db:{nodes,links,sourcesDict} }.
    // opts.extraCorpus: testo/PDF aggiunto dal docente (chiusura gap).
    // opts.structuralSuggestions: se passate (dall'UI, via structure-analyzer),
    //   usate; altrimenti soft-read di window.MappAIStructureAnalyzer; else [].
    function analyzeEnrichment(state, opts) {
        const o = Object.assign({}, DEFAULTS, opts);
        const db = (state && state.db) || {};
        const nodes = db.nodes || [];
        const links = db.links || [];
        const baseCorpus = Fidelity.corpusFromState(state || {});
        const corpus = (baseCorpus + (o.extraCorpus ? '\n' + o.extraCorpus : '')).trim();
        const enoughSource = corpus.length >= 200;

        const structural = resolveStructural(o.structuralSuggestions, nodes, links);

        return {
            corpus: { words: wc(corpus), hasSource: enoughSource, extraAdded: !!o.extraCorpus },
            text: analyzeTextSignals(corpus, o),
            coverage: enoughSource ? analyzeCoverage(nodes, corpus, o)
                : { hasSource: false, groundedness: null, cards: [], cappedCards: false },
            structural
        };
    }

    // L'UI DOVREBBE passare opts.structuralSuggestions (calcolate con la modalità
    // dichiarata: analyzeStructure(nodes, links, {mode})) — più accurate del soft-read
    // qui sotto, che lascia a detectMode l'inferenza dagli ID. Il soft-read è solo un
    // fallback comodo (assente in Node → nessun gap strutturale, non bloccante).
    function resolveStructural(passed, nodes, links) {
        if (Array.isArray(passed)) return passed;
        try {
            const SA = (typeof window !== 'undefined') && window.MappAIStructureAnalyzer;
            if (SA && SA.analyzeStructure) return SA.analyzeStructure(nodes, links).suggestions || [];
        } catch (e) { /* assente in Node → nessun gap strutturale */ }
        return [];
    }

    return {
        DEFAULTS,
        analyzeTextSignals,
        analyzeCoverage,
        analyzeEnrichment
    };
}));
