/* =========================================================================
   mappai-materiali-attesa-core.js — I MATERIALI CHE ASPETTANO LA G2 (0090)

   Giacomo, 12/10: «vicino a ogni materiale un chip […] che apre G2»; «il chip
   deve solo riaprire G2 al punto in cui era stato lasciato l'ultima volta […]
   e che sparisce quando si completa la validazione».

   Qui, e solo qui (invariante 4), le regole:
     · `g2InAttesa`  il manifesto ha una G2 da completare
                     (`review.final.stage === 'awaiting_review'`);
     · `righe`       per ognuno dei materiali chiesti in `manifest.config` e
                     non ancora prodotti, la riga da mettere nella tabella della
                     sua categoria: il TIPO è quello di `GRUPPI_MAT`
                     (mappai-landing-teach.js), il nome quello di `NOMI_FUNZ`
                     (mappai-elabora-console.js). Una G2 copre tutti: le righe
                     hanno lo stesso chip e lo perdono insieme;
     · `taratura`    il testo di «Adatta alla classe» (parte D, T1 (a)):
                     la classe ha una taratura (il pallino verde) oppure no.

   Interruttori (inv. 1), accesi salvo '0':
     · `mappai_elabora_attesa`  righe col chip, ritorno in ELABORA, avviso nel
                                modale (parti A, B, C);
     · `mappai_modale_taratura` il riquadro «Adatta alla classe» (parte D).

   Logica pura: niente DOM, niente `window` nelle funzioni, niente localStorage
   (chi chiama passa il suo `storage`).
   ========================================================================= */
(function (root, factory) {
    var CORE = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
    if (root) root.MappAIMaterialiAttesaCore = CORE;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var CHIAVE = 'mappai_elabora_attesa';
    var CHIAVE_TARATURA = 'mappai_modale_taratura';

    function _letto(storage, chiave) {
        try { return !!storage && typeof storage.getItem === 'function' && storage.getItem(chiave) !== '0'; }
        catch (e) { return false; }
    }
    /* Un errore di lettura, o nessun `storage`, vale «spento»: la strada di prima. */
    function acceso(storage) { return _letto(storage, CHIAVE); }
    function tarAcceso(storage) { return _letto(storage, CHIAVE_TARATURA); }

    /* 0094 (lotto F2, difetto 9 della guida): un manifesto conta solo per il SUO
       progetto: vero se `review.projectId` (o `reading.projectId`) è l'id del progetto
       oppure se il suo `vaultPath` è la cartella del progetto (NFC, `\` → `/`, senza `/`
       finale); falso se uno dei due dice un altro progetto e l'altro non lo smentisce;
       un manifesto senza nessuno dei due (vecchio) vale come prima. Senza `progetto`
       (chi chiama come prima): vero. */
    function _forma(p) { var v = String(p == null ? '' : p); try { v = v.normalize('NFC'); } catch (e) { } return v.replace(/\\/g, '/').replace(/\/+$/, ''); }
    function diQuestoProgetto(manifest, progetto) {
        if (!progetto) return true;
        if (!manifest || typeof manifest !== 'object') return false;
        var id = (manifest.review && manifest.review.projectId) || (manifest.reading && manifest.reading.projectId) || null;
        var vp = manifest.vaultPath || (manifest.review && manifest.review.vaultPath) || '';
        var idOk = (id && progetto.projectId) ? id === progetto.projectId : null;
        var vpOk = (vp && progetto.vaultPath) ? _forma(vp) === _forma(progetto.vaultPath) : null;
        /* basta uno dei due: una cartella rinominata dal Finder ha il percorso vecchio
           e l'id giusto; una copia di prova ha l'id vecchio e il percorso giusto */
        if (idOk === true || vpOk === true) return true;
        return !(idOk === false || vpOk === false);
    }

    function g2InAttesa(manifest, progetto) {
        if (progetto && !diQuestoProgetto(manifest, progetto)) return false;
        var f = manifest && !manifest.reading && manifest.review && manifest.review.final;
        return !!(f && f.stage === 'awaiting_review');
    }

    /* ⚠️ Lo stato dei passi B–E NON dice se il file c'è (gate dello 0090, 12/10): con la
       revisione dei materiali i passi producono le BOZZE, e `steps.B.status === 'done'`
       arriva PRIMA della G2; i file nascono dopo, in `_finishReviewed` (approved →
       finalizing → done). Finché la G2 aspetta, ogni materiale chiesto è da fare. */

    /* L'ordine è quello delle tabelle (`GRUPPI_MAT`): sintesi, fogli, catena,
       domande, flashcard. `tipo` è la parola con cui `tabelleMateriali` sceglie
       la tabella; `chiave`/`nome` sono quelli di `NOMI_FUNZ` della console. */
    var MATERIALI = [
        { id: 'syn', passo: 'D', tipo: 'Sintesi', chiave: 'ec_n_syn', nome: 'Sintesi', chiesto: function (c) { return !!c.synthesis; } },
        { id: 'ns', passo: 'C', tipo: 'Foglio nodi', chiave: 'ec_n_ns', nome: 'Foglio dei nodi', chiesto: function (c) { return !!c.nodesheet; } },
        { id: 'cc', passo: 'E', tipo: 'Catena dei perché', chiave: 'ec_n_cc', nome: 'Catena dei perché', chiesto: function (c) { return !!c.causal; } },
        { id: 'mc', passo: 'B', tipo: 'Quiz MC', chiave: 'ec_n_mc', nome: 'Scelta Multipla', chiesto: function (c) { return _tipoQuiz(c, 'mc'); } },
        { id: 'open', passo: 'B', tipo: 'Domande aperte', chiave: 'ec_n_open', nome: 'Domande Aperte', chiesto: function (c) { return _tipoQuiz(c, 'open'); } },
        { id: 'fc', passo: 'B', tipo: 'Flashcard', chiave: 'ec_n_flash', nome: 'Flashcard', chiesto: function (c) { return _tipoQuiz(c, 'flashcards'); } }
    ];
    function _tipoQuiz(c, t) {
        return !!(c.quiz && Array.isArray(c.quiz.types) && c.quiz.types.indexOf(t) >= 0);
    }

    /* → [{ id: 'att:<materiale>', tipo, chiave, nome, chip: true }], vuoto se la
       G2 non aspetta. Gli id cominciano con `att:`: non si confondono con i set
       (`set:`) né con i file del vault. */
    function righe(manifest, progetto) {
        if (!g2InAttesa(manifest, progetto)) return [];
        var c = manifest.config || {};
        return MATERIALI.filter(function (m) { return m.chiesto(c); })
            .map(function (m) { return { id: 'att:' + m.id, tipo: m.tipo, chiave: m.chiave, nome: m.nome, chip: true }; });
    }
    function eRiga(id) { return String(id || '').indexOf('att:') === 0; }

    /* Parte D, T1 (a): «serve solo sapere se la classe ha già una taratura
       attiva oppure no». `speciale` è il pallino verde della lista delle classi
       (`MappAIClasses.classSpecial`), calcolato da chi chiama. Senza classe
       scelta, niente da dire. */
    function taratura(nomeClasse, speciale) {
        if (!nomeClasse) return null;
        return speciale
            ? { attiva: true, chiave: 'mp_adapt_on_cls', riserva: 'La classe {nome} ha una taratura (note o registro): i materiali la seguono. Spegnila per questo giro, se non serve.' }
            : { attiva: false, chiave: 'mp_adapt_off_cls', riserva: 'La classe {nome} non ha una taratura. Accendila per questo giro.' };
    }

    return {
        CHIAVE: CHIAVE,
        CHIAVE_TARATURA: CHIAVE_TARATURA,
        acceso: acceso,
        tarAcceso: tarAcceso,
        g2InAttesa: g2InAttesa,
        diQuestoProgetto: diQuestoProgetto,
        righe: righe,
        eRiga: eRiga,
        taratura: taratura
    };
});
