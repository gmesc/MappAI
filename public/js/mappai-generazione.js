/* mappai-generazione.js — IL LUCCHETTO DELLA GENERAZIONE (14/8/26)
 *
 * Il difetto: `mappaiOccupato()` copriva la PIPELINE dei materiali
 * (`Pipeline._running`), non una generazione MM/KG nuda. Finché il velo copriva
 * tutto lo schermo la cosa non si notava; da quando copre la sola area di CREA
 * si può girare per l'app, e basta un HOME — `backToLanding` fa
 * `location.reload()` — per uccidere una generazione in silenzio, coi token già
 * spesi.
 *
 * Qui c'è UN posto che sa se una generazione sta girando, e su che cosa. Chi
 * deve difendersi lo chiede; chi deve spegnere un comando lo chiede.
 *
 * ⚠️ La regola che governa tutto: durante una generazione si può GUARDARE, non
 * SOSTITUIRE. Quello che vive sul DISCO (INSEGNA: elencare i vault, aprire un
 * PDF o un HTML nell'iframe, stampare, QR, Finder) non tocca `appState` e resta
 * aperto; quello che CARICA una mappa in `appState` — o che ci scrive dentro —
 * si spegne, e lo dice invece di non fare niente.
 */
(function () {
    'use strict';

    var stato = { attiva: false, nome: '', modo: '', da: 0 };

    function t(k, f) { return window.t ? window.t(k, f) : f; }

    /* Le superfici che mostrano un comando spento non si accorgono da sole che
       lo stato è cambiato: si annuncia, come per i profili (una superficie che
       mostra dati scritti altrove non si aggiorna da sé). */
    function annuncia() {
        try {
            document.dispatchEvent(new CustomEvent('mappai-generazione-cambiata',
                { detail: { attiva: stato.attiva, nome: stato.nome } }));
        } catch (e) { }
        try { document.documentElement.classList.toggle('mappai-genera', stato.attiva); } catch (e) { }
    }

    var API = {
        inizia: function (nome, modo) {
            stato.attiva = true;
            stato.nome = String(nome || '').trim();
            stato.modo = modo || '';
            stato.da = Date.now();
            annuncia();
        },
        fine: function () {
            stato.attiva = false;
            annuncia();
        },
        attiva: function () { return !!stato.attiva; },
        nome: function () { return stato.nome; },

        /* Il MOTIVO, in chiaro. Un comando spento senza motivo si legge come un
           difetto dell'app; con il motivo si legge come un'attesa. */
        motivo: function () {
            var n = stato.nome;
            return n
                ? t('gen_motivo_nome', 'Sto generando «') + n + t('gen_motivo_fine', '»: si riapre appena è pronta.')
                : t('gen_motivo', 'Generazione in corso: si riapre appena è pronta.');
        },

        /* La domanda che fanno i comandi: «posso caricare una mappa adesso?».
           `false` + toast col motivo, così chi chiama non deve ripetere la copia. */
        puoiCaricare: function (avvisa) {
            if (!stato.attiva) return true;
            if (avvisa !== false && window.showToast) window.showToast(API.motivo(), 'warning');
            return false;
        }
    };

    window.MappAIGen = API;
})();
