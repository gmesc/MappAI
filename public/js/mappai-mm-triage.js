// ══════════════════════════════════════════════════════════════════════════
// MappAI — MindMap Triage (pre-pass: profondità adattiva dalla struttura fonte)
// ══════════════════════════════════════════════════════════════════════════
//
// Una SINGOLA chiamata AI PRIMA della Fase 1, SOLO in modalità mindmap, gated dal
// flag `mappai_mm_triage_enabled` (toggle "Adattiva" nella landing, ex-BERT).
//
// Motivazione (misure CoreCov@Lk su 13 mappe reali, luglio 2026): la profondità a
// cui vive il contenuto ESSENZIALE dipende dal TIPO EPISTEMICO della scheda, non
// dalla materia. Testo tassonomico/definizionale (cos'è X) si deposita a L≤2 e L3+
// è piatto → approfondire genera solo parafrasi. Testo procedurale/causale/sistemico
// (come funziona/come accade) sfonda a L3 con contenuto vero. Un contatore di
// connettivi NON predice la classe (r≈0.17): serve un lettore semantico della
// struttura → questo triage.
//
// Output (verdetto) stashato su appState.mmTriage; nell'MVP si consuma SOLO
// `essentialDepth` per cappare il TARGET del deepening (Fase 3.7): tassonomico
// (2) → nessun approfondimento; procedurale (3) → scava solo le foglie sotto L3.
// Gli altri campi (contentType/hasOrderedChains/coverageTarget/rationale) sono
// prodotti e persistiti come ganci per una futura policy coverage-first, non
// ancora attivi.
//
// REVERSIBILITÀ: flag OFF (default) o qualunque fallimento → ritorna null →
// deepening usa il tetto utente → comportamento byte-identico a oggi. La
// generazione non viene MAI bloccata (try/catch totale).
//
// appState è `let` in app.js (non su window): accesso via _getAppState (regola
// progetto, come dev-console-metrics.js). Il modulo è caricato DOPO app.js.
(function () {
    'use strict';

    function _getAppState() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }

    const SAMPLE_CAP = 12000;   // il triage basta su un campione: costo/latenza minimi
    const CACHE_KEY = 'mappai_triage_cache';
    const CACHE_MAX = 80;       // FIFO leggero, per non gonfiare localStorage

    // Cache per-fonte: stessa scheda → STESSO verdetto (deterministico) e zero
    // costo AI sulle rigenerazioni (i docenti iterano). Hash djb2 del corpus.
    function _hashCorpus(s) {
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return 'h' + (h >>> 0).toString(36) + '_' + s.length;
    }
    function _cacheGet(hash) {
        try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); return c[hash] || null; }
        catch (e) { return null; }
    }
    function _cachePut(hash, v) {
        try {
            const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
            c[hash] = v;
            const keys = Object.keys(c);
            if (keys.length > CACHE_MAX) delete c[keys[0]];
            localStorage.setItem(CACHE_KEY, JSON.stringify(c));
        } catch (e) { /* localStorage pieno/assente → nessuna cache, non bloccante */ }
    }

    // Schema del verdotto (Google: responseSchema nativo; Infomaniak: solo prompt).
    const TRIAGE_SCHEMA = {
        type: 'object',
        properties: {
            contentType:      { type: 'string', enum: ['taxonomic', 'procedural', 'causal-narrative', 'mixed'] },
            essentialDepth:   { type: 'integer', minimum: 2, maximum: 3 },
            hasOrderedChains: { type: 'boolean' },
            coverageTarget:   { type: 'number' },
            rationale:        { type: 'string' }
        },
        required: ['contentType', 'essentialDepth', 'hasOrderedChains', 'coverageTarget', 'rationale']
    };

    const SYS = [
        'Sei un progettista dell\'apprendimento. NON riassumi il contenuto: giudichi la FORMA',
        'CONCETTUALE di una scheda didattica per decidere quanto in profondità deve stare il',
        'contenuto ESSENZIALE di una mappa mentale inclusiva (studenti BES/DSA).',
        '',
        'Distingui due tipi:',
        '- TASSONOMICO/definizionale ("cos\'è X", classificazioni, glossari, elenchi di parti):',
        '  si dispone bene in POCHI livelli → essentialDepth = 2. Approfondire oltre genererebbe',
        '  solo parafrasi.',
        '- PROCEDURALE/CAUSALE/SISTEMICO ("come funziona / come accade", catene di passi, cause→',
        '  effetti, sottosistemi che si presuppongono): il contenuto vero vive PIÙ IN PROFONDITÀ',
        '  → essentialDepth = 3.',
        'Se il testo mescola i due in modo sostanziale → "mixed", essentialDepth = 3.',
        '',
        'hasOrderedChains = true se ci sono SEQUENZE ORDINATE (fasi, passi, tappe cronologiche)',
        'che vanno tenute contigue. coverageTarget = quota della scheda (0.5–0.8) che lo strato',
        'essenziale dovrebbe coprire: ~0.7 per il tassonomico denso, ~0.6 per il procedurale.',
        'rationale = massimo 200 caratteri, per il docente.',
        '',
        'Rispondi SOLO con un oggetto JSON con ESATTAMENTE questi campi:',
        '{"contentType":"taxonomic|procedural|causal-narrative|mixed","essentialDepth":2|3,',
        '"hasOrderedChains":true|false,"coverageTarget":0.6,"rationale":"..."}'
    ].join('\n');

    // API: async, ritorna il verdetto {contentType, essentialDepth, ...} o null.
    window.runMindMapTriage = async function (textParts, apiKey) {
        try {
            // Gate: parte con «Adattiva» (logica MM) O con «Profondità automatica»
            // (toggle vicino al menu gen-depth). Entrambi consumano essentialDepth.
            if (localStorage.getItem('mappai_mm_triage_enabled') !== '1' &&
                localStorage.getItem('mappai_auto_depth') !== '1') return null;   // default OFF
            const S = _getAppState();
            if (!apiKey || !S || S.extractionMode !== 'mindmap') return null;             // gate modalità
            if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'triage');

            const corpus = (Array.isArray(textParts) ? textParts : [textParts])
                .filter(Boolean).join('\n\n').slice(0, SAMPLE_CAP);
            if (corpus.trim().length < 200) return null;                                  // fonte troppo corta → niente triage

            // Cache per-fonte: verdetto deterministico + zero costo su rigenerazione
            const hash = _hashCorpus(corpus);
            const cached = _cacheGet(hash);
            if (cached) { console.info('[MMTriage] cache', cached.contentType, 'essentialDepth=' + cached.essentialDepth); return cached; }

            const base = { temperature: 0, maxOutputTokens: window.getMaxOutputTokens ? window.getMaxOutputTokens(1000) : 2000 };
            // responseMimeType/responseSchema SOLO su Google (regola nota: Infomaniak li rompe).
            const gcfg = (S.aiProvider === 'infomaniak')
                ? Object.assign({}, base)
                : Object.assign({}, base, { responseMimeType: 'application/json', responseSchema: TRIAGE_SCHEMA });

            const payload = {
                contents: [{ role: 'user', parts: [{ text: 'TESTO-FONTE DELLA SCHEDA:\n\n' + corpus }] }],
                systemInstruction: { parts: [{ text: SYS }] },
                generationConfig: gcfg
            };
            if (window.injectClassTuning) window.injectClassTuning(payload);              // no-op senza classe attiva

            const response = await window.fetchModelAPI(payload, apiKey);
            const rawText = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (!rawText) return null;

            const clean = rawText.replace(/```json?/gi, '').replace(/```/g, '').trim();
            let v = null;
            try { v = window.salvageTruncatedJSON ? window.salvageTruncatedJSON(clean) : JSON.parse(clean); }
            catch (e) { return null; }                                                    // JSON irrecuperabile → fallback silenzioso
            if (Array.isArray(v)) v = v[0];
            if (!v || typeof v !== 'object') return null;

            const ed = parseInt(v.essentialDepth);
            if (!(ed === 2 || ed === 3)) return null;                                     // verdetto malformato → null
            v.essentialDepth = ed;
            _cachePut(hash, v);                                                           // memorizza per rigenerazioni
            console.info('[MMTriage]', v.contentType || '?', 'essentialDepth=' + ed,
                v.hasOrderedChains ? '· catene ordinate' : '', '·', v.rationale || '');
            return v;
        } catch (e) {
            console.warn('[MMTriage] errore non bloccante:', e && e.message);
            return null;                                                                  // MAI bloccare la generazione
        }
    };
})();
