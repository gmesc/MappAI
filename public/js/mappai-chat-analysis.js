// ==========================================================================
// mappai-chat-analysis.js — Meta-analisi DETERMINISTICA delle chat tutor
// --------------------------------------------------------------------------
// Puro JS, zero AI, zero dipendenze. Estrae metriche dai turni-utente della
// chat (tutorState: {sidebar:{history}, nodes:{id:{history}}}) in formato
// Gemini {role, parts:[{text}]}. Alimenta il tool di meta-analisi docente
// (Tier 2 + neurofeedback). Vedi docs/game-design/META_ANALYSIS_SDS.md.
//
// ⚠️ Paletti (baked nell'interpretazione, non nel calcolo):
//  - Errori ortografici ≠ competenza (BES/DSA): NON calcoliamo spelling.
//  - "Stili di apprendimento" fissi = mito → qui solo PATTERN osservati.
//  - Campione piccolo → il chiamante mostra la confidenza (n turni).
// ==========================================================================
(function () {
    'use strict';

    // Stopword italiane minime (per TTR e adozione lessico disciplinare).
    const STOP = new Set(('di a da in con su per tra fra il lo la i gli le un uno una e o ma se ' +
        'che chi cui non come dove quando perche perché quale quali quanto quanta cosa ci si mi ti vi ' +
        'è e ho hai ha abbiamo avete hanno sono sei siamo siete essere avere del dello della dei degli ' +
        'delle al allo alla ai agli alle nel nello nella nei negli nelle sul sullo sulla questo questa ' +
        'questi queste quello quella suo sua loro mio tua più meno molto poco anche solo già poi qui qua').split(/\s+/));

    function _text(entry) {
        if (!entry) return '';
        if (typeof entry === 'string') return entry;
        if (entry.parts && entry.parts.length) return entry.parts.map(p => (p && p.text) || '').join(' ');
        return entry.content || entry.text || '';
    }

    // Raccoglie i turni-utente con il tag di modalità: [{text, mode}].
    function collectUserTurnsTagged(tutorState) {
        const turns = [];
        if (!tutorState) return turns;
        const push = (hist) => {
            (hist || []).forEach(e => { if (e && e.role === 'user') { const t = _text(e).trim(); if (t) turns.push({ text: t, mode: e.mode || null }); } });
        };
        if (tutorState.sidebar) push(tutorState.sidebar.history);
        if (tutorState.nodes) Object.keys(tutorState.nodes).forEach(id => push(tutorState.nodes[id] && tutorState.nodes[id].history));
        return turns;
    }
    // Solo i testi (retrocompat).
    function collectUserTurns(tutorState) { return collectUserTurnsTagged(tutorState).map(t => t.text); }

    function _words(s) {
        return (s.toLowerCase().match(/[a-zàèéìòùç]+/gi) || []);
    }
    function _sentences(s) {
        return s.split(/[.!?]+/).map(x => x.trim()).filter(Boolean);
    }
    function _round(n, d) { const f = Math.pow(10, d || 0); return Math.round((n || 0) * f) / f; }

    // Classifica una domanda per parola interrogativa italiana.
    // NB: niente \b finale — dopo lettere accentate (é) \b non regge in JS regex.
    // Ipotetica: pattern stretti — il vecchio / se / matchava qualsiasi "se"
    // ("non so se...", "anche se...") gonfiando il conteggio delle ipotetiche.
    function _questionType(q) {
        const t = ' ' + q.toLowerCase().replace(/[?!.,;:]/g, ' ') + ' ';
        if (/ e se | che succede(rebbe)? se | cosa succede(rebbe)? se | se fosse | se avesse | se non ci fosse | se invece | succedere?bbe /.test(t)) return 'ipotetica';
        if (/ perch[eé] | perche | come mai | per quale motivo /.test(t)) return 'causale';
        if (/ come /.test(t)) return 'procedurale';
        if (/ (cosa|che cosa|chi|quando|dove|quale|quali|quanto|quanti|quanta) /.test(t)) return 'fattuale';
        return 'altro';
    }

    // Marker di autoregolazione / elaborazione attiva.
    const REFORM = /\b(non ho capito|non capisco|puoi rispiegare|rispiega|quindi|cio[eè]|in pratica|vuol dire|significa che|allora)\b/i;

    // Analisi principale. mapLabels = array di label della mappa (per adozione lessico).
    function analyzeChat(tutorState, mapLabels) {
        const turns = collectUserTurns(tutorState);
        const n = turns.length;
        const blob = turns.join(' \n ');
        const words = _words(blob);
        const sentences = _sentences(blob);
        const letters = (blob.match(/[a-zàèéìòùç]/gi) || []).length;

        // --- Volume ---
        const questions = turns.filter(t => t.includes('?'));
        const nodesWithChat = tutorState && tutorState.nodes
            ? Object.keys(tutorState.nodes).filter(id => (tutorState.nodes[id].history || []).some(e => e && e.role === 'user')).length : 0;

        // --- Stile domande ---
        const types = { fattuale: 0, procedurale: 0, causale: 0, ipotetica: 0, altro: 0 };
        questions.forEach(q => { types[_questionType(q)]++; });
        const reasoning = types.causale + types.ipotetica;
        const reasoningRatio = questions.length ? reasoning / questions.length : 0;
        const reformulations = turns.filter(t => REFORM.test(t)).length;

        // Attribuzione per modalità di interazione (turni taggati da app.js).
        const byMode = {};
        collectUserTurnsTagged(tutorState).forEach(tt => {
            const key = tt.mode || 'untagged';
            const b = byMode[key] || (byMode[key] = { turns: 0, questions: 0, reasoning: 0 });
            b.turns++;
            if (tt.text.includes('?')) { b.questions++; const qt = _questionType(tt.text); if (qt === 'causale' || qt === 'ipotetica') b.reasoning++; }
        });

        // --- Proprietà di linguaggio ---
        const unique = new Set(words).size;
        const contentWords = words.filter(w => w.length > 3 && !STOP.has(w));
        const ttr = words.length ? unique / words.length : 0;
        const avgWordLen = words.length ? words.reduce((s, w) => s + w.length, 0) / words.length : 0;
        const avgSentLen = sentences.length ? words.length / sentences.length : 0;
        // Gulpease (leggibilità italiano): 89 + (300*frasi - 10*lettere) / parole. Alto = facile.
        const gulpease = words.length ? Math.max(0, Math.min(100, _round(89 + (300 * sentences.length - 10 * letters) / words.length, 0))) : null;

        // Adozione del lessico disciplinare della mappa.
        let disciplinaryAdoption = null, disciplinaryHits = 0, disciplinaryTerms = 0;
        if (mapLabels && mapLabels.length) {
            const terms = new Set();
            mapLabels.forEach(l => _words(String(l)).forEach(w => { if (w.length > 3 && !STOP.has(w)) terms.add(w); }));
            disciplinaryTerms = terms.size;
            const chatSet = new Set(contentWords);
            terms.forEach(t => { if (chatSet.has(t)) disciplinaryHits++; });
            disciplinaryAdoption = disciplinaryTerms ? disciplinaryHits / disciplinaryTerms : null;
        }

        return {
            confidence: n < 3 ? 'bassa' : (n < 10 ? 'media' : 'buona'),
            sampleQuestions: questions.slice(0, 8),
            volume: {
                userTurns: n,
                questions: questions.length,
                nodesWithChat: nodesWithChat,
                totalWords: words.length,
                followUpRatio: n ? _round((n - nodesWithChat) / n, 2) : 0
            },
            questionStyle: {
                types: types,
                reasoningRatio: _round(reasoningRatio, 2),
                reformulations: reformulations
            },
            byMode: byMode,
            language: {
                gulpease: gulpease,
                typeTokenRatio: _round(ttr, 3),
                avgWordLen: _round(avgWordLen, 1),
                avgSentenceLen: _round(avgSentLen, 1),
                disciplinaryAdoption: disciplinaryAdoption == null ? null : _round(disciplinaryAdoption, 2),
                disciplinaryHits: disciplinaryHits,
                disciplinaryTerms: disciplinaryTerms
            }
        };
    }

    const API = {
        analyzeChat: analyzeChat,
        collectUserTurns: collectUserTurns,
        collectUserTurnsTagged: collectUserTurnsTagged,
        _questionType: _questionType
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.MappAIChatAnalysis = API;
})();
