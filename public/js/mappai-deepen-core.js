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
        sentenceDupContainment: 0.80
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
        splitSentences,
        residueSentences,
        buildResidueMaterial,
        paraphraseVerdict,
        filterProposedChildren
    };
}));
