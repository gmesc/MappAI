// ══════════════════════════════════════════════════════════════════════════
// MappAI — Deepen Core (P1 residuo dalla fonte + P2 verdetto anti-parafrasi)
// ══════════════════════════════════════════════════════════════════════════
//
// Logica PURA (zero AI, zero appState) a supporto della Fase 3.7 "deepening
// selettivo" (mappai-generation-support.js:executeDeepeningPass).
//
// Motivazione (audit 20/7/26 su mm_elvezia + mm_la_carta): il deepening
// vecchio si attivava sulla PROFONDITÀ mancante di un ramo e riceveva come
// materiale la SOLA desc del nodo padre → ~40% dei nodi finali erano
// parafrasi del padre (id _D<n>, rel 'approfondisce'). Due interventi:
//
//  P1 — RESIDUO: il materiale per approfondire una foglia non è più la sua
//       desc (che genera parafrasi per costruzione) ma le FRASI DELLA FONTE
//       che (a) parlano del tema della foglia e (b) portano informazione NON
//       già presente nella desc. Se non c'è residuo → niente approfondimento.
//       Il contenuto guida la profondità, non viceversa.
//
//  P2 — VERDETTO: rete di sicurezza deterministica DOPO la generazione. Ogni
//       sotto-concetto proposto è confrontato col "già coperto" (desc del
//       padre + fratelli già accettati): se il suo lessico è in gran parte
//       contenuto lì (containment alto) o porta troppe poche parole nuove,
//       viene SCARTATO (era già nel padre → nessuna perdita). Cattura anche
//       i cluster di fratelli quasi-identici (es. la battaglia raccontata 6
//       volte) perché il covered cresce coi fratelli accettati.
//
// Tokenizzazione/stemming: riusa MappAIDescFidelity (contentWords +
// buildSourceIndex, match esatto o per radice a 6 char per le flessioni
// italiane). Fallback interno equivalente se il modulo non è caricato, così
// il core resta testabile in isolamento. Test: tests/deepen-core.test.js
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./mappai-desc-fidelity.js'));
    } else {
        root.MappAIDeepenCore = factory(root.MappAIDescFidelity);
    }
}(typeof self !== 'undefined' ? self : this, function (DescFidelity) {
    'use strict';

    // ── Soglie (override via opts in ogni funzione pubblica) ────────────────
    const DEFAULTS = {
        // P1 — selezione delle frasi-residuo
        relMin: 0.12,        // frazione min di parole della frase in comune col padre (on-topic)
        minNewWords: 3,      // parole-contenuto NUOVE min perché una frase sia residuo
        maxSentences: 10,    // top-N frasi residue restituite (cap materiale)
        minSentenceWords: 4, // frasi più corte scartate (rumore)
        maxSentenceChars: 320, // frasi mostruose troncate (tabelle, liste incollate)
        // P2 — verdetto anti-parafrasi
        maxContainment: 0.60, // se ≥ questa quota del figlio è già nel coperto → parafrasi
        minNewChildWords: 3,  // parole-contenuto NUOVE min perché un figlio sia legittimo
        // dedup fra frasi residue selezionate
        sentenceDupContainment: 0.80,
        // P1-bis — un assorbitore (nodo non approfondibile) uccide una frase che
        // ha ancora novità SOLO se la reclama con pertinenza forte (è davvero il
        // suo tema); sotto questa soglia la vittoria è "di superficie" e la
        // frase ripiega sulla migliore foglia approfondibile.
        absorberClaimMin: 0.5
    };

    const STEM_LEN = (DescFidelity && DescFidelity.STEM_LEN) || 6;

    // ── Tokenizzazione (delega a DescFidelity, fallback interno equivalente) ─
    const _FALLBACK_STOP = new Set([
        'della', 'delle', 'dello', 'degli', 'alla', 'alle', 'agli', 'allo',
        'dalla', 'dalle', 'nella', 'nelle', 'negli', 'nello', 'sulla',
        'questo', 'questa', 'questi', 'queste', 'quello', 'quella', 'come',
        'dove', 'quando', 'perche', 'anche', 'ancora', 'dopo', 'prima',
        'senza', 'sopra', 'sotto', 'verso', 'ogni', 'tutto', 'tutta', 'tutti',
        'tutte', 'loro', 'sono', 'erano', 'essere', 'stato', 'stata', 'aveva',
        'hanno', 'viene', 'veniva', 'vengono', 'venne', 'quindi', 'inoltre',
        'infatti', 'invece', 'mentre', 'durante', 'tramite', 'attraverso',
        'that', 'this', 'these', 'those', 'with', 'from', 'were', 'been',
        'have', 'their', 'which', 'would', 'could', 'should', 'about'
    ]);
    function _fallbackWords(text) {
        return String(text || '')
            .toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[’´`]/g, "'")
            .split(/[^a-z0-9]+/)
            .filter(w => w && !_FALLBACK_STOP.has(w) && (/\d/.test(w) ? w.length >= 2 : w.length >= 4));
    }
    function contentWords(text) {
        return (DescFidelity && DescFidelity.contentWords)
            ? DescFidelity.contentWords(text)
            : _fallbackWords(text);
    }

    // Indice del "coperto": Set di parole esatte + Set di radici a STEM_LEN.
    function buildCoverageIndex(text) {
        if (DescFidelity && DescFidelity.buildSourceIndex) return DescFidelity.buildSourceIndex(text);
        const words = new Set(), stems = new Set();
        for (const w of _fallbackWords(text)) {
            words.add(w);
            if (w.length >= STEM_LEN) stems.add(w.slice(0, STEM_LEN));
        }
        return { words, stems };
    }
    // Una parola è "coperta" se esatta o con la stessa radice nel coperto.
    function _isCovered(w, idx) {
        if (idx.words.has(w)) return true;
        return w.length >= STEM_LEN && idx.stems.has(w.slice(0, STEM_LEN));
    }

    // Confronto lessicale di un testo contro un indice-coperto.
    // → { total, covered, newWords: [uniche non coperte], containment: 0..1 }
    function lexicalOverlap(text, coverageIndexOrText) {
        const idx = (coverageIndexOrText && coverageIndexOrText.words instanceof Set)
            ? coverageIndexOrText : buildCoverageIndex(coverageIndexOrText);
        const ws = contentWords(text);
        if (!ws.length) return { total: 0, covered: 0, newWords: [], containment: 0 };
        let covered = 0;
        const seenNew = new Set(), newWords = [];
        for (const w of ws) {
            if (_isCovered(w, idx)) covered++;
            else if (!seenNew.has(w)) { seenNew.add(w); newWords.push(w); }
        }
        return { total: ws.length, covered, newWords, containment: covered / ws.length };
    }

    // ── Frasi ───────────────────────────────────────────────────────────────
    function splitSentences(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .split(/(?<=[.!?;:])\s+|\n+/)
            .map(s => s.trim())
            .filter(Boolean);
    }

    // Similarità di Jaccard sui token-contenuto di due testi (0..1).
    function jaccardSim(textA, textB) {
        const a = new Set(contentWords(textA)), b = new Set(contentWords(textB));
        if (!a.size || !b.size) return 0;
        let inter = 0;
        for (const w of a) if (b.has(w)) inter++;
        return inter / (a.size + b.size - inter);
    }

    // ── P1 — RESIDUO ─────────────────────────────────────────────────────────
    // Frasi della fonte che parlano del tema del padre MA aggiungono lessico
    // non ancora nella sua desc. Ordinate per quantità di novità, deduplicate
    // fra loro. `parentText` = label + desc del nodo padre; `corpus` = fonte.
    function residueSentences(parentText, corpus, opts) {
        const o = Object.assign({}, DEFAULTS, opts);
        const parentIdx = buildCoverageIndex(parentText);
        const parentWords = new Set(contentWords(parentText));
        if (!parentWords.size) return [];

        const picked = [];              // { text, novelty, words:Set }
        for (let raw of splitSentences(corpus)) {
            if (raw.length > o.maxSentenceChars) raw = raw.slice(0, o.maxSentenceChars);
            const ws = contentWords(raw);
            if (ws.length < o.minSentenceWords) continue;
            // rilevanza: quota di parole della frase che stanno nel tema del padre
            let onTopic = 0;
            const newSet = new Set();
            for (const w of ws) {
                if (_isCovered(w, parentIdx)) onTopic++;
                else newSet.add(w);
            }
            const relevance = onTopic / ws.length;
            if (relevance < o.relMin) continue;         // off-topic
            if (newSet.size < o.minNewWords) continue;   // nessuna info nuova → è la desc del padre
            // dedup fra frasi già scelte (evita di ripetere lo stesso residuo)
            const dup = picked.some(p => {
                const inter = [...newSet].filter(w => p.words.has(w)).length;
                return inter / newSet.size >= o.sentenceDupContainment;
            });
            if (dup) continue;
            picked.push({ text: raw, novelty: newSet.size, words: newSet });
        }
        picked.sort((a, b) => b.novelty - a.novelty);
        return picked.slice(0, o.maxSentences).map(p => p.text);
    }

    // Materiale-residuo pronto per il prompt (stringa), '' se non c'è residuo.
    function buildResidueMaterial(parentText, corpus, opts) {
        return residueSentences(parentText, corpus, opts).join(' ');
    }

    // ── P1-bis — ASSEGNAZIONE GLOBALE frase→foglia ──────────────────────────
    // Difetto osservato (mappa "Storia della Carta" 2A): ogni foglia pescava il
    // residuo in modo indipendente → la stessa frase della fonte (es. i magli
    // idraulici di Fabriano) veniva depositata come figlio in 4 rami diversi,
    // anche sotto padri fuori tema ("Produzione Papiro") dove la pertinenza
    // lessicale di superficie bastava a passare il gate.
    // Qui ogni frase del corpus è assegnata AL SOLO competitor con pertinenza
    // massima (argmax): niente doppi depositi, e la frase finisce dove è
    // davvero a tema. competitors: [{ id, parentText, eligible }] — DEVE
    // includere anche i nodi NON approfondibili (eligible:false = assorbitori).
    // Se l'argmax è un assorbitore, la frase viene UCCISA solo in due casi:
    //  - è già coperta lì (novità < minNewWords → davvero ridondante), oppure
    //  - l'assorbitore la reclama con pertinenza forte (≥ absorberClaimMin: la
    //    frase è chiaramente il SUO tema, depositarla altrove la collocherebbe
    //    male — es. i magli di Fabriano sotto "Produzione Papiro").
    // Altrimenti la vittoria è "di superficie" (tipico: il padre a desc ricca
    // out-copre la propria foglia specifica) e la frase ripiega sulla migliore
    // foglia approfondibile — senza questo ripiego il deepening perderebbe
    // recall proprio dove le desc dei padri sono più curate (finding review
    // 21/7/26). A parità di pertinenza un eligible batte sempre un assorbitore.
    // → Map<id, material:string> (solo competitor eligible con residuo).
    function assignResidues(competitors, corpus, opts) {
        const o = Object.assign({}, DEFAULTS, opts);
        const prepared = (competitors || []).map(c => ({
            id: c.id,
            eligible: c.eligible !== false,
            idx: buildCoverageIndex(c.parentText),
            hasWords: contentWords(c.parentText).length > 0
        })).filter(c => c.hasWords);
        const out = new Map();
        if (!prepared.length) return out;

        const perLeaf = new Map();  // id → [{text, novelty, words}] (solo eligible)
        prepared.forEach(c => { if (c.eligible) perLeaf.set(c.id, []); });

        // ordine: pertinenza, poi eligible batte assorbitore, poi novità
        const beats = (a, b) => !b || a.relevance > b.relevance ||
            (a.relevance === b.relevance && (
                (a.comp.eligible ? 1 : 0) > (b.comp.eligible ? 1 : 0) ||
                ((a.comp.eligible ? 1 : 0) === (b.comp.eligible ? 1 : 0) && a.newSet.size > b.newSet.size)));

        for (let raw of splitSentences(corpus)) {
            if (raw.length > o.maxSentenceChars) raw = raw.slice(0, o.maxSentenceChars);
            const ws = contentWords(raw);
            if (ws.length < o.minSentenceWords) continue;
            let best = null, bestEligible = null;
            for (const comp of prepared) {
                let onTopic = 0;
                const newSet = new Set();
                for (const w of ws) {
                    if (_isCovered(w, comp.idx)) onTopic++;
                    else newSet.add(w);
                }
                const relevance = onTopic / ws.length;
                if (relevance < o.relMin) continue;
                // per DEPOSITARE serve novità; un assorbitore compete comunque
                if (comp.eligible && newSet.size < o.minNewWords) continue;
                const cand = { comp, relevance, newSet };
                if (beats(cand, best)) best = cand;
                if (comp.eligible && beats(cand, bestEligible)) bestEligible = cand;
            }
            let winner = null;
            if (best) {
                if (best.comp.eligible) {
                    winner = best;
                } else if (best.newSet.size < o.minNewWords || best.relevance >= o.absorberClaimMin) {
                    winner = null;           // assorbita davvero: coperta o chiaramente sua
                } else {
                    winner = bestEligible;   // vittoria di superficie → ripiega (può essere null)
                }
            }
            if (winner) {
                perLeaf.get(winner.comp.id).push({ text: raw, novelty: winner.newSet.size, words: winner.newSet });
            }
        }

        // per foglia: dedup fra frasi assegnate + ordinamento per novità + cap
        for (const [id, picked] of perLeaf) {
            const kept = [];
            picked.sort((a, b) => b.novelty - a.novelty);
            for (const p of picked) {
                const dup = kept.some(k => {
                    const inter = [...p.words].filter(w => k.words.has(w)).length;
                    return inter / p.words.size >= o.sentenceDupContainment;
                });
                if (!dup) kept.push(p);
            }
            const material = kept.slice(0, o.maxSentences).map(k => k.text).join(' ');
            if (material) out.set(id, material);
        }
        return out;
    }

    // ── P3 — GATE ANTI-DUPLICATO GLOBALE ────────────────────────────────────
    // Un candidato è quasi-duplicato di un nodo ESISTENTE (qualsiasi ramo) se
    // Jaccard alto sui token-contenuto O se il suo lessico è quasi tutto già
    // contenuto in quel nodo. Cattura i gemelli cross-ramo ("Fili metallici
    // Fabriano" ↔ "Fili Metallici nei Setacci") che il verdetto padre+fratelli
    // non può vedere. `others` = array di stringhe (label+desc dei nodi).
    // → indice del primo duplicato in others, o -1.
    function isNearDuplicate(text, others, opts) {
        const o = Object.assign({ dupJaccard: 0.55, dupContainment: 0.75 }, opts);
        const aList = contentWords(text);   // tokenizza il candidato UNA volta
        if (!aList.length) return -1;
        const aSet = new Set(aList);
        for (let i = 0; i < (others || []).length; i++) {
            const other = others[i];
            if (!other) continue;
            const idx = buildCoverageIndex(other);
            let inter = 0, covered = 0;
            for (const w of aSet) if (idx.words.has(w)) inter++;
            for (const w of aList) if (_isCovered(w, idx)) covered++;
            if (inter / (aSet.size + idx.words.size - inter) >= o.dupJaccard) return i;
            if (covered / aList.length >= o.dupContainment) return i;
        }
        return -1;
    }

    // ── P2 — VERDETTO ANTI-PARAFRASI ─────────────────────────────────────────
    // Un sotto-concetto è legittimo se NON è in gran parte già nel coperto e
    // porta abbastanza parole nuove. `coveredText` = desc del padre + desc dei
    // fratelli già accettati.
    // → { accept, containment, newWordCount, reason }
    function paraphraseVerdict(childText, coveredText, opts) {
        const o = Object.assign({}, DEFAULTS, opts);
        const ov = lexicalOverlap(childText, coveredText);
        if (ov.total === 0) {
            return { accept: false, containment: 0, newWordCount: 0, reason: 'vuoto' };
        }
        if (ov.containment >= o.maxContainment) {
            return { accept: false, containment: ov.containment, newWordCount: ov.newWords.length, reason: 'parafrasi' };
        }
        if (ov.newWords.length < o.minNewChildWords) {
            return { accept: false, containment: ov.containment, newWordCount: ov.newWords.length, reason: 'poco-nuovo' };
        }
        return { accept: true, containment: ov.containment, newWordCount: ov.newWords.length, reason: 'ok' };
    }

    // Filtro incrementale di una lista di sotto-concetti proposti: il coperto
    // cresce coi figli accettati → i duplicati fra fratelli cadono uno per uno.
    // children: [{ label, desc, ... }]. Ritorna { accepted:[...], rejected:[...] }.
    function filterProposedChildren(children, parentCoveredText, opts) {
        const accepted = [], rejected = [];
        let covered = String(parentCoveredText || '');
        for (const c of (children || [])) {
            const text = ((c.label || '') + ' ' + (c.desc || '')).trim();
            const v = paraphraseVerdict(text, covered, opts);
            if (v.accept) {
                accepted.push(Object.assign({}, c, { _verdict: v }));
                covered += '\n' + (c.desc || c.label || '');
            } else {
                rejected.push(Object.assign({}, c, { _verdict: v }));
            }
        }
        return { accepted, rejected };
    }

    return {
        DEFAULTS,
        contentWords,
        buildCoverageIndex,
        lexicalOverlap,
        jaccardSim,
        splitSentences,
        residueSentences,
        buildResidueMaterial,
        assignResidues,
        paraphraseVerdict,
        filterProposedChildren,
        isNearDuplicate
    };
}));
