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
    /* Giorni e mesi abbreviati: con la maiuscola e SENZA punto sono quasi sempre
       un nome (Cai Lun, Mar Nero). L'accento sulla vocale non cambia il suono e
       toglie alla voce l'appiglio per scioglierli. */
    var PROTETTI = {
        it: {
            'Lun': 'Lùn', 'Mar': 'Màr', 'Mer': 'Mèr', 'Gio': 'Giò', 'Ven': 'Vèn', 'Sab': 'Sàb', 'Dom': 'Dòm',
            'Gen': 'Gèn', 'Feb': 'Fèb', 'Apr': 'Àpr', 'Mag': 'Màg', 'Giu': 'Giù', 'Lug': 'Lùg',
            'Ago': 'Àgo', 'Set': 'Sèt', 'Ott': 'Òtt', 'Nov': 'Nòv', 'Dic': 'Dìc'
        },
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

    function _unaParola(parola, l) {
        var p = _parti(parola), n = p.nucleo;
        var sost = ESTESO[l][n] || PROTETTI[l][n];
        return sost ? p.a + sost + p.z : parola;
    }

    function perVoce(testo, lang) {
        var l = _lingua(lang);
        return String(testo == null ? '' : testo).replace(/\S+/g, function (w) { return _unaParola(w, l); });
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
