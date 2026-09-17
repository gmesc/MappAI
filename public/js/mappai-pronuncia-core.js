/*
 * mappai-pronuncia-core.js — come la voce di sistema deve DIRE il testo (17/9/26)
 * ---------------------------------------------------------------------------
 * Due guasti sentiti sull'iPad: «105 d.C.» letto «d punto c punto», e «Cai Lun»
 * letto «Cai Lunedì» — la voce italiana scioglie da sé le abbreviazioni dei
 * giorni e dei mesi, anche quando sono un nome. Qui:
 *   · perVoce(testo, lang)       le abbreviazioni di scuola per esteso, e i
 *                                nomi che sembrano abbreviazioni protetti;
 *   · abbreviazione(parola, lang) vero se il punto di quella parola NON chiude
 *                                la frase (d.C., ecc., J.) — il lettore non ci
 *                                spezza le frasi.
 * Solo per la VOCE: lo schermo mostra il testo com'è.
 *
 * ⚠️ Le regole lavorano su UNA parola alla volta (niente spazi dentro una
 * chiave): il karaoke conta le parole parola per parola, e i conti tornano
 * solo se sciogliere la frase intera o ogni sua parola dà lo stesso risultato.
 *
 * UMD puro, testato in Node (tests/pronuncia-core.test.js).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIPronunciaCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var ESTESO = {
        it: {
            'a.C.': 'avanti Cristo', 'd.C.': 'dopo Cristo', 'a.c.': 'avanti Cristo', 'd.c.': 'dopo Cristo',
            'sec.': 'secolo', 'secc.': 'secoli', 'ca.': 'circa', 'ecc.': 'eccetera', 'etc.': 'eccetera',
            'es.': 'esempio', 'p.es.': 'per esempio', 'cfr.': 'confronta',
            'pag.': 'pagina', 'pagg.': 'pagine', 'ss.': 'e seguenti', 'vs': 'contro', 'vs.': 'contro',
            'sig.': 'signor', 'sig.ra': 'signora', 'dott.': 'dottor', 'dott.ssa': 'dottoressa',
            'prof.': 'professor', 'prof.ssa': 'professoressa',
            'km': 'chilometri', 'kg': 'chilogrammi', 'cm': 'centimetri', 'mm': 'millimetri',
            'km²': 'chilometri quadrati', 'm²': 'metri quadrati', 'm³': 'metri cubi'
        },
        en: {
            'e.g.': 'for example', 'i.e.': 'that is', 'etc.': 'et cetera', 'vs.': 'versus', 'vs': 'versus',
            'approx.': 'approximately', 'B.C.': 'B C', 'A.D.': 'A D', 'km': 'kilometres', 'kg': 'kilograms'
        }
    };
    /* Giorni e mesi abbreviati che la voce italiana di Apple SCIOGLIE anche quando
       sono un nome («Cai Lun» → «Cai Lunedì»). Misurato il 17/9/26 con `say -v
       Alice` (le stesse voci dell'iPad) e un trascrittore: Mar, Mer, Gio, Ven,
       Gen, Ago, Set, Ott li legge già come parole e qui non stanno.
       ⚠️ L'ACCENTO NON FUNZIONA: «Lùn» non è una parola e viene compitato
       («elle u enne»), «Màr» diventa «M.A.R.». Raddoppiare la consonante finale
       sì: «Lunn» dura quanto «Lum», una sillaba, e non si scioglie. Magg, Aprr e
       Dicc uscivano compitati o storpiati: fuori, come nomi sono rarissimi. */
    var PROTETTI = {
        it: { 'Lun': 'Lunn', 'Sab': 'Sabb', 'Dom': 'Domm', 'Feb': 'Febb', 'Giu': 'Giù', 'Lug': 'Lugg', 'Nov': 'Novv' },
        en: {}
    };

    function _lingua(lang) { return /^en/i.test(String(lang || '')) ? 'en' : 'it'; }
    /* punteggiatura che può stare attaccata fuori da una parola; il punto no:
       nelle abbreviazioni è parte della parola */
    var DAVANTI = /^[(\[«"'“‘]+/, DIETRO = /[)\]»"'”’,;:!?…]+$/;

    function _parti(parola) {
        var s = String(parola || ''), a = (DAVANTI.exec(s) || [''])[0];
        s = s.slice(a.length);
        var z = (DIETRO.exec(s) || [''])[0];
        return { a: a, nucleo: s.slice(0, s.length - z.length), z: z };
    }

    function perVoce(testo, lang) {
        var l = _lingua(lang), s = String(testo == null ? '' : testo);
        return s.replace(/\S+/g, function (w, i) {
            var p = _parti(w), n = p.nucleo;
            if (ESTESO[l][n]) return p.a + ESTESO[l][n] + p.z;
            // «Lun 3 marzo» è davvero un giorno: si protegge solo se dopo non c'è un numero.
            // Una parola ne dà sempre UNA: i conti del karaoke non cambiano.
            if (PROTETTI[l][n] && !/^\s*\d/.test(s.slice(i + w.length))) return p.a + PROTETTI[l][n] + p.z;
            return w;
        });
    }

    /* Il punto di questa parola chiude la frase? No, se è un'abbreviazione nota
       (non a fine testo: lì chiude comunque) o un'iniziale puntata (J. R. R.). */
    function abbreviazione(parola, lang) {
        var n = _parti(parola).nucleo;
        if (/^[A-ZÀ-Ý]\.$/.test(n)) return true;
        return Object.prototype.hasOwnProperty.call(ESTESO[_lingua(lang)], n) && /\.$/.test(n);
    }

    return { perVoce: perVoce, abbreviazione: abbreviazione, _ESTESO: ESTESO, _PROTETTI: PROTETTI };
}));
