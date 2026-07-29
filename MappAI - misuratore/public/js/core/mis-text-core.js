/**
 * mis-text-core — metriche linguistiche.
 *
 * ⚠️ NESSUNA LISTA È UNA COSTANTE DI QUESTO MODULO. Suffissi, connettivi,
 * marcatori, soglie e velocità arrivano tutti dal profilo di parametri.
 * È la lezione di research.md R1: l'assessment del 2026 usò liste che nessuno
 * mise per iscritto, e oggi metà delle sue cifre non è riproducibile — sui
 * connettivi subordinanti lo scarto è di 3,5×, sui causali di 4×.
 *
 * Puro: niente DOM, niente rete, niente Electron, nessuna data implicita.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MisTextCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ── Tokenizzazione — CALIBRATA (research.md R1) ─────────────────────────
    // L'apostrofo APPARTIENE alla parola («l'ospitalità» = 1), il trattino
    // SEPARA («politico-amministrativa» = 2). È l'unica delle quattro varianti
    // testate che riproduce 1A al centesimo su tutte e quattro le righe.
    const RE_PAROLA = /[A-Za-zÀ-ÿ0-9']+/g;
    const RE_LETTERA = /[A-Za-zÀ-ÿ]/g;

    function tokenize(testo) {
        return String(testo || '').match(RE_PAROLA) || [];
    }

    function _p(profilo, k, def) {
        const v = profilo && profilo.parametri && profilo.parametri[k];
        return v && v.valore !== undefined ? v.valore : def;
    }

    // ── Blocchi ────────────────────────────────────────────────────────────
    // Un corpo di testo è una sequenza di blocchi { tipo, testo }. Accettiamo
    // anche una stringa: diventa un blocco solo, di tipo paragrafo.
    function _blocchi(input) {
        if (typeof input === 'string') return [{ tipo: 'paragrafo', testo: input }];
        if (!Array.isArray(input)) return [];
        return input.map((b) => (typeof b === 'string' ? { tipo: 'paragrafo', testo: b } : b));
    }

    function testoPiatto(input) {
        return _blocchi(input).map((b) => b.testo || '').join('\n');
    }

    /**
     * Segmentazione in frasi PER BLOCCO (research.md R9).
     * Un blocco senza punteggiatura finale conta come UNA frase: senza questa
     * regola i titoli si fondono col paragrafo seguente e gonfiano la lunghezza
     * media, che su un documento molto titolato sposta il Gulpease di punti.
     */
    function splitSentences(input, profilo) {
        const abbrev = _p(profilo, 'abbreviazioni', []);
        // Sentinella: il punto delle abbreviazioni viene sostituito prima di
        // spezzare e ripristinato dopo, così «ecc.» non chiude la frase E il
        // testo resta integro. Scritta come escape, mai come byte letterale.
        const SENT = '\u0001';
        const reAbbr = abbrev.length
            ? new RegExp('\\b(' + abbrev.join('|') + ')\\.', 'gi')
            : null;
        const out = [];

        _blocchi(input).forEach((b, iBlocco) => {
            let t = String(b.testo || '').trim();
            if (!t) return;
            if (reAbbr) t = t.replace(reAbbr, '$1' + SENT);
            // Un punto seguito da minuscola non chiude la frase (sigle, decimali).
            t = t.replace(/([.!?])(\s+)([a-zà-ÿ])/g, '$1' + SENT + '$2$3');

            const ripristina = (x) => x.split(SENT).join('.').trim();
            const pezzi = t.split(/[.!?]+/).map(ripristina).filter(Boolean);

            // Un blocco senza punteggiatura finale conta come UNA frase (R9):
            // senza questa regola i titoli si fondono col paragrafo seguente.
            if (!pezzi.length) { out.push({ testo: ripristina(t), blocco: iBlocco, tipo: b.tipo }); return; }
            pezzi.forEach((x) => out.push({ testo: x, blocco: iBlocco, tipo: b.tipo }));
        });

        return out;
    }

    // ── Sillabe (research.md R2) ───────────────────────────────────────────
    // Conteggio per GRUPPI VOCALICI con accorpamento di dittonghi e trittonghi.
    // L'italiano ha ortografia trasparente: ogni gruppo vocalico è una sillaba,
    // salvo gli iati, che questo metodo non distingue (limite dichiarato).
    const VOCALI = 'aeiouàèéìíîòóùúAEIOUÀÈÉÌÍÎÒÓÙÚ';
    function countSyllables(parola) {
        const w = String(parola || '').toLowerCase();
        if (!w) return 0;
        let sill = 0, inGruppo = false;
        for (let i = 0; i < w.length; i++) {
            const eVocale = VOCALI.indexOf(w[i]) >= 0;
            if (eVocale && !inGruppo) { sill++; inGruppo = true; }
            else if (!eVocale) { inGruppo = false; }
        }
        return sill || 1;   // una parola senza vocali (sigla) vale una sillaba
    }

    // ── Indici di leggibilità ──────────────────────────────────────────────
    function _base(input, profilo) {
        const piatto = testoPiatto(input);
        const parole = tokenize(piatto);
        const frasi = splitSentences(input, profilo);
        const lettere = (piatto.match(RE_LETTERA) || []).length;
        return { piatto, parole, nParole: parole.length, nFrasi: frasi.length, lettere };
    }

    function gulpease(input, profilo) {
        const b = _base(input, profilo);
        if (!b.nParole || !b.nFrasi) return { valore: null, motivo: 'testo vuoto' };
        return {
            parole: b.nParole, frasi: b.nFrasi, lettere: b.lettere,
            paroleFrase: +(b.nParole / b.nFrasi).toFixed(2),
            valore: +(89 + (300 * b.nFrasi - 10 * b.lettere) / b.nParole).toFixed(1),
            motivo: null,
        };
    }

    function fleschVacca(input, profilo) {
        const b = _base(input, profilo);
        if (!b.nParole || !b.nFrasi) return { valore: null, motivo: 'testo vuoto' };
        const sillabe = b.parole.reduce((a, w) => a + countSyllables(w), 0);
        const S = sillabe / b.nParole * 100;
        const P = b.nParole / b.nFrasi;
        return {
            sillabe, sillabe100: +S.toFixed(2), paroleFrase: +P.toFixed(2),
            valore: +(206 - 0.65 * S - P).toFixed(1),
            motivo: null,
        };
    }

    // ── Conteggi per liste dal profilo ─────────────────────────────────────
    function _escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    function _contaEspressioni(piatto, espressioni) {
        if (!espressioni || !espressioni.length) return 0;
        const re = new RegExp('(?:^|[^A-Za-zÀ-ÿ])(' +
            espressioni.map(_escapeRe).join('|') + ')(?![A-Za-zÀ-ÿ])', 'gi');
        let n = 0;
        while (re.exec(piatto) !== null) n++;
        return n;
    }

    function _contaPassive(piatto, ausiliari) {
        if (!ausiliari || !ausiliari.length) return 0;
        const re = new RegExp('\\b(' + ausiliari.map(_escapeRe).join('|') +
            ')\\s+\\w+(?:ato|ata|ati|ate|uto|uta|uti|ute|ito|ita|iti|ite)\\b', 'gi');
        let n = 0;
        while (re.exec(piatto) !== null) n++;
        return n;
    }

    function lexicalProfile(input, profilo) {
        const b = _base(input, profilo);
        if (!b.nParole) {
            return { calcolabile: false, motivo: 'testo vuoto', paroleTotali: 0 };
        }
        const per100 = (n) => +(n / b.nParole * 100).toFixed(2);

        const minLunga = _p(profilo, 'parolaLungaMinChar', 8);
        const suffissi = _p(profilo, 'suffissiNominalizzazione', []);
        const reNom = suffissi.length
            ? new RegExp('(' + suffissi.map(_escapeRe).join('|') + ')$', 'i') : null;

        const lunghe = b.parole.filter((w) => w.length >= minLunga).length;
        const nomin = reNom ? b.parole.filter((w) => reNom.test(w)).length : 0;

        const sub = _contaEspressioni(b.piatto, _p(profilo, 'connettiviSubordinanti', []));
        const caus = _contaEspressioni(b.piatto, _p(profilo, 'connettiviCausali', []));
        const pass = _contaPassive(b.piatto, _p(profilo, 'ausiliariPassivo', []));

        const g = gulpease(input, profilo);
        const fv = fleschVacca(input, profilo);

        const ppmLettura = _p(profilo, 'velocitaLetturaPpm', 120);
        const ppmAscolto = _p(profilo, 'velocitaAscoltoPpm', 150);

        return {
            calcolabile: true, motivo: null,
            paroleTotali: b.nParole,
            frasi: b.nFrasi,
            paroleFrase: +(b.nParole / b.nFrasi).toFixed(2),
            gulpease: g.valore,
            fleschVacca: fv.valore,
            parolLunghePct: +(lunghe / b.nParole * 100).toFixed(1),
            nominalizzazioni100: per100(nomin),
            connettiviSubordinanti100: per100(sub),
            connettiviCausali100: per100(caus),
            passive100: per100(pass),
            caricoSintattico100: +(per100(sub) + per100(pass)).toFixed(2),
            marcatoriEsempio: _contaEspressioni(b.piatto, _p(profilo, 'marcatoriEsempio', [])),
            marcatoriAnalogia: _contaEspressioni(b.piatto, _p(profilo, 'marcatoriAnalogia', [])),
            tempoLetturaMin: +(b.nParole / ppmLettura).toFixed(1),
            tempoAscoltoMin: +(b.nParole / ppmAscolto).toFixed(1),
        };
    }

    // ── Dispositivi di scansione (componente 6) ────────────────────────────
    function formatDevices(input, profilo) {
        const bl = _blocchi(input);
        const voci = bl.filter((b) => b.tipo === 'voce-elenco');
        const titoli = bl.filter((b) => b.tipo === 'titolo');
        const domande = titoli.filter((b) => /\?|^\s*(cos'?è|che cos'?è|come|perché|quando|dove|quali)\b/i.test(b.testo || ''));

        const parole = tokenize(testoPiatto(input)).length;
        const marcatori = _contaEspressioni(testoPiatto(input), _p(profilo, 'marcatoriEsempio', []));
        const totale = voci.length + titoli.length + domande.length + marcatori;

        const medieDi = (arr) => (arr.length
            ? arr.reduce((a, b) => a + tokenize(b.testo || '').length, 0) / arr.length
            : null);

        return {
            elenchi: voci.length,
            sottotitoli: titoli.length,
            titoliDomanda: domande.length,
            marcatori,
            dispositivi1000: parole ? +(totale / parole * 1000).toFixed(2) : null,
            parolePerElenco: medieDi(voci) === null ? null : +medieDi(voci).toFixed(1),
            parolePerSottotitolo: medieDi(titoli) === null ? null : +medieDi(titoli).toFixed(1),
            calcolabile: bl.some((b) => b.tipo === 'titolo' || b.tipo === 'voce-elenco'),
            motivo: bl.some((b) => b.tipo === 'titolo' || b.tipo === 'voce-elenco')
                ? null : 'testo senza formattazione',
        };
    }

    // ── Lingua ─────────────────────────────────────────────────────────────
    // Non serve un rilevatore vero: basta distinguere l'italiano abbastanza da
    // sapere se Gulpease e Flesch-Vacca hanno senso. Se non è 'it', chi chiama
    // marca le metriche di leggibilità come di validità dubbia.
    const SPIA_IT = ['di', 'il', 'la', 'che', 'per', 'una', 'con', 'del', 'della', 'sono', 'non', 'nel'];
    function detectLanguage(input) {
        const w = tokenize(testoPiatto(input)).map((x) => x.toLowerCase());
        if (w.length < 30) return 'incerto';
        const spia = new Set(SPIA_IT);
        const quota = w.filter((x) => spia.has(x)).length / w.length;
        if (quota >= 0.06) return 'it';
        if (quota >= 0.025) return 'incerto';
        return 'altro';
    }

    return {
        tokenize, splitSentences, countSyllables, gulpease, fleschVacca,
        lexicalProfile, formatDevices, detectLanguage, testoPiatto,
    };
}));
