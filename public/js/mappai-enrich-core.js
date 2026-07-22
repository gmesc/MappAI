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
// mappai-relations.js entra come TERZA dipendenza (vocabolario linking words per
// famiglia). Soft-fallback: se manca a load-time i segnali per-famiglia si saltano
// (vedi _relations()) → l'ordine di caricamento in index.html non può rompere nulla.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./mappai-deepen-core.js'), require('./mappai-desc-fidelity.js'), require('./mappai-relations.js'));
    } else {
        root.MappAIEnrichCore = factory(root.MappAIDeepenCore, root.MappAIDescFidelity, root.MappAIRelations);
    }
}(typeof self !== 'undefined' ? self : this, function (Deepen, Fidelity, Relations) {
    'use strict';

    const DEFAULTS = {
        poorGroundedness: 0.45,   // sotto = nodo poco ancorato alla fonte
        poorWordCount: 25,        // desc più corta = nodo "povero"
        maxResiduePerCard: 5,     // frasi-fonte mostrate per card (cap UI)
        maxCards: 24,             // card di copertura totali (cap UI)
        longSentence: 30,         // parole: frase lunga (leggibilità BES/DSA)
        // ── segnali di "imparabilità" del testo (deterministici, descrittivi) ──
        gulpeaseFloor: 40,          // Gulpease medio sotto = decodifica faticosa (≈ licenza media)
        gulpeaseMinParaWords: 15,   // paragrafi più corti = rumore, esclusi dal calcolo
        gulpeaseParaCharCap: 2000,  // oltre = "paragrafo" da PDF su una riga → si chunka
        gulpeaseChunkSentences: 8,  // frasi per chunk quando un paragrafo è troppo lungo
        familySignalMaxFamilies: 2, // ≤ N famiglie di nessi presenti (su 7) = testo monotono
        glossaryMinFreq: 4,         // freq minima di un candidato glossario
        glossaryMinLen: 7,          // lunghezza minima di un candidato glossario
        termDefFreq: 3,             // freq minima perché un termine sia "chiave" (uso-prima-def)
        termDefLen: 6,              // lunghezza minima del termine chiave
        termDefLag: 2               // frasi di ritardo tollerate fra primo uso e definizione
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

    // ── Utilità per i segnali di imparabilità (tutte pure, deterministiche) ──
    const STEM_LEN = (Fidelity && Fidelity.STEM_LEN) || 6;
    // "lettera estesa": include accenti à-ÿ → confini di parola affidabili anche
    // su verbi/marcatori che iniziano per 'è' (\b ASCII qui non basterebbe).
    const _LETTER = 'a-zà-ÿ0-9';
    const _escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // regex per una frase-verbo (anche multi-parola: 'porta a', 'fa parte di'):
    // \s+ tollera spazi multipli, i confini escludono lettere/accenti/cifre.
    function _phraseRe(phrase) {
        const body = _escRe(phrase).replace(/\s+/g, '\\s+');
        return new RegExp('(?<![' + _LETTER + '])' + body + '(?![' + _LETTER + '])', 'gi');
    }
    function _countPhrase(lowNorm, phrase) {
        const m = lowNorm.match(_phraseRe(phrase));
        return m ? m.length : 0;
    }
    // Marcatori definitori: accenti CONSERVATI così 'è' (copula) ≠ 'e' (congiunzione).
    const DEF_MARKER = new RegExp('(?<![' + _LETTER + '])(è|sono|si\\s+chiama(?:no)?|si\\s+definisce|cioè|ossia|vale\\s+a\\s+dire|detto|chiamat[oa])(?![' + _LETTER + '])', 'gi');
    const DEF_WINDOW = 48;   // caratteri fra termine e marcatore per dirli "vicini"

    // Soft-fallback per il vocabolario relazioni: factory-arg o, in extremis,
    // window.MappAIRelations (browser con ordine di caricamento anomalo). null →
    // i segnali per-famiglia vengono semplicemente saltati (nessun crash).
    function _relations() {
        if (Relations && Relations.EDGE_FAMILIES) return Relations;
        try {
            if (typeof window !== 'undefined' && window.MappAIRelations && window.MappAIRelations.EDGE_FAMILIES) {
                return window.MappAIRelations;
            }
        } catch (e) { /* window assente in Node */ }
        return null;
    }

    // ── Gulpease (indice di leggibilità IT). NON è un voto: profilo descrittivo. ──
    // Formula: 89 + (300×frasi − 10×lettere)/parole, clamp 0..100. Conteggi RAW
    // (non le parole-contenuto): la difficoltà di decodifica pesa TUTTE le parole.
    function _gulpeaseScore(unitText) {
        const words = (unitText.match(/\S+/g) || []).length;
        if (!words) return null;
        const sentences = Math.max(1, Deepen.splitSentences(unitText).length);
        const letters = (unitText.match(/[a-zà-ÿ]/gi) || []).length;
        let score = 89 + (300 * sentences - 10 * letters) / words;
        score = Math.max(0, Math.min(100, score));
        return { words, sentences, letters, score: Math.round(score) };
    }
    // Unità di misura = paragrafi (split su \n+). I paragrafi troppo corti sono
    // rumore; quelli enormi (PDF = una riga sola) vengono chunkati per frasi.
    function _gulpeaseUnits(text, o) {
        const paras = String(text).split(/\n+/).map(p => p.trim()).filter(Boolean);
        const units = [];
        for (const p of paras) {
            if ((p.match(/\S+/g) || []).length < o.gulpeaseMinParaWords) continue;
            if (p.length > o.gulpeaseParaCharCap) {
                const ss = Deepen.splitSentences(p);
                for (let i = 0; i < ss.length; i += o.gulpeaseChunkSentences) {
                    const chunk = ss.slice(i, i + o.gulpeaseChunkSentences).join(' ');
                    if ((chunk.match(/\S+/g) || []).length >= o.gulpeaseMinParaWords) units.push(chunk);
                }
            } else {
                units.push(p);
            }
        }
        return units;
    }
    function _gulpease(text, o) {
        const perParagraph = [];
        _gulpeaseUnits(text, o).forEach((u, index) => {
            const g = _gulpeaseScore(u);
            if (g) perParagraph.push({ index, words: g.words, sentences: g.sentences, letters: g.letters, score: g.score });
        });
        const avg = perParagraph.length
            ? Math.round(perParagraph.reduce((a, p) => a + p.score, 0) / perParagraph.length)
            : null;
        const worstParagraphs = perParagraph.slice()
            .sort((a, b) => a.score - b.score)
            .slice(0, 3)
            .map(p => ({ index: p.index, score: p.score }));
        return { avg, perParagraph, worstParagraphs };
    }

    // ── Densità dei nessi per FAMIGLIA (regola progetto 12: verbi solo da EDGE_FAMILIES) ──
    function _connectivesByFamily(lowNorm, per1000) {
        const R = _relations();
        const out = {};
        if (!R || !R.EDGE_FAMILIES || !R.getFamilyVerbs) return out; // soft-fallback
        Object.keys(R.EDGE_FAMILIES).forEach(key => {
            if (key === 'altro') return;
            const verbs = R.getFamilyVerbs(key, 'it') || [];
            let count = 0; const found = [];
            verbs.forEach(v => {
                const c = _countPhrase(lowNorm, v);
                if (c > 0) { count += c; found.push(v); }
            });
            out[key] = { count, per1000: per1000(count), found };
        });
        return out;
    }

    // ── Esempi (didattici) + analogie/metafore esplicite ──
    function _markers(lowNorm, connectives) {
        const R = _relations();
        // esempi: la regex esemplificativa esistente + marcatori didattici extra
        let ex = connectives.esemplificativa.count;
        ['come quando', 'immagina', 'prova a pensare', 'pensa a'].forEach(m => { ex += _countPhrase(lowNorm, m); });
        // analogie: verbi della famiglia 'analogia' (getFamilyVerbs esclude 'come') + frasi esplicite
        let an = 0;
        if (R && R.getFamilyVerbs) (R.getFamilyVerbs('analogia', 'it') || []).forEach(v => { an += _countPhrase(lowNorm, v); });
        ['è come', 'una specie di', 'proprio come'].forEach(m => { an += _countPhrase(lowNorm, m); });
        return { examples: ex, analogies: an };
    }

    // Posizione (in caratteri) della prima parola della frase la cui radice = stem
    // (o la forma esatta = term). `low` conserva gli accenti; term/stem sono
    // parole-contenuto già normalizzate → la parola matchata va ristrippata.
    function _termPos(low, stem, term) {
        const re = /[a-zà-ÿ0-9]+/gi; let m;
        while ((m = re.exec(low)) !== null) {
            const w = m[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
            if (w === term || (w.length >= STEM_LEN && w.slice(0, STEM_LEN) === stem)) return m.index;
        }
        return -1;
    }

    // ── Termini usati prima della definizione + candidati glossario ──
    // Un pass unico costruisce le mappe stem→frasi; per ogni radice si cerca la
    // prima frase in cui il termine è DEFINITO (vicino a un marcatore). Se la
    // definizione arriva troppo tardi → "uso prima della definizione"; se non
    // arriva mai → candidato glossario. Le due liste sono disgiunte per costruzione.
    function _termAnalysis(sentences, contentW, o) {
        const out = { termsBeforeDefinition: [], glossaryCandidates: [] };
        if (!sentences.length) return out;

        const freq = {};
        contentW.forEach(w => { freq[w] = (freq[w] || 0) + 1; });

        const sInfo = sentences.map(s => {
            const low = s.toLowerCase();
            const cov = Deepen.buildCoverageIndex(s);
            let markerIdx = null;
            DEF_MARKER.lastIndex = 0; let m;
            while ((m = DEF_MARKER.exec(low)) !== null) {
                (markerIdx || (markerIdx = [])).push(m.index);
                if (DEF_MARKER.lastIndex <= m.index) DEF_MARKER.lastIndex = m.index + 1; // guardia
            }
            return { low, cov, markerIdx };
        });

        const firstUseByStem = {};
        const sentByStem = {};
        sInfo.forEach((si, i) => {
            si.cov.stems.forEach(st => {
                if (firstUseByStem[st] === undefined) firstUseByStem[st] = i;
                (sentByStem[st] || (sentByStem[st] = [])).push(i);
            });
        });

        function defIdxForStem(st, term) {
            const cand = sentByStem[st];
            if (!cand) return -1;
            for (const i of cand) {
                const si = sInfo[i];
                if (!si.markerIdx) continue;
                const tp = _termPos(si.low, st, term);
                if (tp < 0) continue;
                if (si.markerIdx.some(mi => Math.abs(mi - tp) <= DEF_WINDOW)) return i;
            }
            return -1;
        }

        // raggruppa le inflessioni per radice a STEM_LEN, forma-display = la più frequente
        const groups = {};
        Object.keys(freq).forEach(w => {
            if (w.length < o.termDefLen) return;
            const st = w.length >= STEM_LEN ? w.slice(0, STEM_LEN) : w;
            const g = groups[st] || (groups[st] = { forms: {}, freq: 0, best: w, bestFreq: 0 });
            g.forms[w] = freq[w]; g.freq += freq[w];
            if (freq[w] > g.bestFreq) { g.bestFreq = freq[w]; g.best = w; }
        });

        const tbd = [];
        for (const st of Object.keys(groups)) {
            const g = groups[st];
            if (g.freq < o.termDefFreq) continue;
            const firstUse = firstUseByStem[st];
            if (firstUse === undefined) continue;
            const di = defIdxForStem(st, g.best);
            if (di < 0) continue;                          // mai definito → semmai glossario
            if (di > firstUse + o.termDefLag) {
                tbd.push({ term: g.best, usedAtSentence: firstUse + 1, definedAtSentence: di + 1 });
            }
        }
        tbd.sort((a, b) => a.usedAtSentence - b.usedAtSentence);
        out.termsBeforeDefinition = tbd.slice(0, 8);

        const glossary = [];
        for (const st of Object.keys(groups)) {
            const g = groups[st];
            // display fra le sole forme lunghe ≥ glossaryMinLen; freq = somma di quelle forme
            let best = null, bestFreq = 0, aggr = 0;
            for (const form of Object.keys(g.forms)) {
                if (form.length < o.glossaryMinLen) continue;
                aggr += g.forms[form];
                if (g.forms[form] > bestFreq) { bestFreq = g.forms[form]; best = form; }
            }
            if (!best || aggr < o.glossaryMinFreq) continue;
            if (defIdxForStem(st, best) >= 0) continue;    // ha una definizione da qualche parte
            glossary.push({ term: best, freq: aggr });
        }
        glossary.sort((a, b) => b.freq - a.freq);
        out.glossaryCandidates = glossary.slice(0, 10);

        return out;
    }

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

        // ── segnali di imparabilità (deterministici, additivi) ──
        const lowNorm = text.toLowerCase().replace(/\s+/g, ' ');
        const gulpease = _gulpease(text, o);
        const connectivesByFamily = _connectivesByFamily(lowNorm, per1000);
        const mk = _markers(lowNorm, connectives);
        const markers = {
            examples: { count: mk.examples, per1000: per1000(mk.examples) },
            analogies: { count: mk.analogies, per1000: per1000(mk.analogies) }
        };
        const term = _termAnalysis(sentences, contentW, o);
        const termsBeforeDefinition = term.termsBeforeDefinition;
        const glossaryCandidates = term.glossaryCandidates;

        // ── osservazioni azionabili (conservative, descrittive) ──
        const signals = [];
        if (connectives.causale.per1000 < 4) {
            signals.push({ key: 'causal_low', value: connectives.causale.count, level: 'notice',
                observation: 'Pochi nessi causali espliciti.',
                suggestion: 'Se il tema è un processo o una catena di cause-effetti, rendere espliciti i legami (perché, quindi, di conseguenza) aiuta chi ha poche preconoscenze.' });
        }
        // esempi: conta anche i marcatori didattici (markers.examples), non solo la regex esemplificativa
        if (markers.examples.count === 0) {
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
        // Gulpease medio basso → decodifica faticosa (descrittivo, non un voto)
        if (gulpease.avg != null && gulpease.avg < o.gulpeaseFloor) {
            signals.push({ key: 'gulpease_low', value: gulpease.avg, level: 'notice',
                observation: 'Indice di leggibilità Gulpease medio ' + gulpease.avg + ' — frasi lunghe e parole lunghe pesano sulla decodifica.',
                suggestion: 'Frasi più corte e parole più semplici alzano l’indice (per una licenza media serve almeno ' + o.gulpeaseFloor + '): intervenire sui paragrafi più fitti aiuta gli studenti BES/DSA.' });
        }
        // Nessi di poche famiglie → ragionamento monotono (solo su testi non brevi)
        const famKeys = Object.keys(connectivesByFamily);
        if (famKeys.length && words > 300) {
            const present = famKeys.filter(k => connectivesByFamily[k].count > 0);
            if (present.length <= o.familySignalMaxFamilies) {
                const R = _relations();
                const labels = present.map(k => (R && R.getFamilyLabel) ? R.getFamilyLabel(k, 'it') : k);
                signals.push({ key: 'connectives_monotone', value: present.length, level: 'notice',
                    observation: present.length
                        ? 'Il testo usa quasi solo nessi di tipo ' + labels.join(', ') + '.'
                        : 'Il testo non usa quasi nessun nesso relazionale esplicito.',
                    suggestion: 'Esplicitare relazioni di altro tipo (causa, contrasto, sequenza, condizione…) dove pertinenti rende visibile il ragionamento, non solo l’elenco dei fatti.' });
            }
        }
        // Nessuna analogia/metafora esplicita su materiale corposo
        if (markers.analogies.count === 0 && words > 400) {
            signals.push({ key: 'analogies_none', value: 0, level: 'notice',
                observation: 'Nessuna analogia o metafora esplicita nel materiale.',
                suggestion: 'Le analogie ancorano i concetti astratti al concreto: valuta di aggiungerne per i passaggi più difficili.' });
        }
        // Termini usati prima di essere definiti
        if (termsBeforeDefinition.length >= 2) {
            const top = termsBeforeDefinition.slice(0, 3);
            const obs = top.map(t => '«' + t.term + '» compare alla frase ' + t.usedAtSentence + ' ma viene spiegato solo alla frase ' + t.definedAtSentence).join('; ') + '.';
            signals.push({ key: 'terms_before_def', value: termsBeforeDefinition.length, level: 'notice',
                observation: obs,
                suggestion: 'Anticipare la definizione (o aggiungere un rimando) prima del primo uso riduce il carico per chi ha poche preconoscenze.' });
        }
        // Candidati glossario: termini ricorrenti mai definiti
        if (glossaryCandidates.length >= 3) {
            const top = glossaryCandidates.slice(0, 3).map(c => c.term);
            signals.push({ key: 'glossary_candidates', value: glossaryCandidates.length, level: 'info',
                observation: glossaryCandidates.length + ' termini ricorrenti senza definizione esplicita nel materiale (' + top.join(', ') + '…).',
                suggestion: 'Valuta un mini-glossario o definizioni inline per questi termini: utile soprattutto per gli studenti BES/DSA.' });
        }

        return {
            words, sentences: sentences.length, avgSentenceWords,
            lexicalDensity, typeTokenRatio, uniqueContentWords: uniqueContent,
            connectives, redundancy: repeated,
            gulpease, connectivesByFamily, markers, termsBeforeDefinition, glossaryCandidates,
            signals
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
