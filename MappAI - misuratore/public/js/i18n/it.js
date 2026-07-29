/**
 * MappAI - misuratore — stringhe dell'interfaccia.
 *
 * Solo italiano in v1 (deroga consapevole al principio VII, plan.md →
 * Complexity Tracking). Sono qui e non sparse nel codice proprio perché
 * aggiungere l'inglese resti un file in più e non una riscrittura.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MisI18n = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const IT = {
        app_titolo: 'MappAI - misuratore',
        app_sottotitolo: 'Misura l’accessibilità del materiale generato da MappAI',

        tab_analizza: 'ANALIZZA',
        tab_andamento: 'ANDAMENTO',
        tab_metodo: 'METODO',

        // Caricamento
        car_vault: 'Carica un vault',
        car_pdf: 'Carica dei PDF',
        car_classe: 'Carica una classe intera',
        car_vault_desc: 'Una cartella mappa di MappAI',
        car_pdf_desc: 'Schede, fogli, sintesi',
        car_classe_desc: 'Tutte le mappe di una classe',

        // Elenco elementi
        sez_elementi: 'Materiale caricato',
        sez_report: 'Report prodotti',
        col_nome: 'Nome',
        col_tipo: 'Tipo',
        col_classe: 'Classe',
        col_registro: 'Registro',
        col_materia: 'Materia',
        col_nodi: 'Nodi',
        col_data: 'Data',
        col_titolo: 'Titolo',
        col_elementi: 'Elementi',
        col_azioni: '',

        el_vuoto: 'Nessun materiale caricato. Comincia da uno dei tre bottoni qui sopra.',
        rep_vuoto: 'Nessun report ancora. Seleziona almeno un elemento e avvia l’analisi.',

        sel_conteggio_zero: 'Nessun elemento selezionato',
        sel_conteggio_uno: '1 elemento selezionato — verrà prodotto un profilo',
        sel_conteggio_molti: '{n} elementi selezionati — verrà prodotto un confronto',
        avvia: 'Avvia analisi',

        // Azioni
        az_apri: 'Apri',
        az_cartella: 'Mostra nel Finder',
        az_elimina: 'Elimina',
        az_modifica: 'Modifica',

        // Conferme
        conf_elimina_titolo: 'Eliminare «{nome}»?',
        conf_elimina_testo: 'Per confermare, digita il nome esatto qui sotto. Questa operazione non si annulla.',
        conf_elimina_errato: 'Il nome non corrisponde.',
        conf_annulla: 'Annulla',
        conf_elimina: 'Elimina',

        // Collisione all'import
        coll_titolo: '«{nome}» esiste già',
        coll_testo: 'Vuoi sostituire quello esistente o affiancare questo come copia nuova?',
        coll_sostituisci: 'Sostituisci',
        coll_affianca: 'Affianca come copia',

        // Problemi
        pb_pdf_senza_testo: 'PDF senza testo selezionabile: non misurabile senza OCR',
        pb_lingua: 'Il testo non sembra italiano: le formule di leggibilità valgono poco',
        pb_links_assenti: 'Nessun links.json: le metriche di relazione non sono calcolabili',
        pb_nodi_assenti: 'Nessun nodo leggibile in questa cartella',

        // Stati vuoti degli altri tab
        and_vuoto_titolo: 'Ancora niente da mettere in fila',
        and_vuoto_testo: 'L’andamento diventa leggibile da tre analisi in poi. Con meno, una media dice poco.',
        and_vai: 'Vai ad ANALIZZA',

        met_intro: 'Ogni soglia di questo strumento è una scelta arbitraria. Qui sono tutte dichiarate, con il motivo e il limite, e si possono cambiare.',

        // Footer
        ft_cartella: 'Apri la cartella dei file',
        ft_versione: 'versione {v}',
    };

    function t(chiave, sostituzioni) {
        let s = IT[chiave];
        if (s === undefined) return chiave;   // chiave mancante visibile, non silenziosa
        if (sostituzioni) {
            Object.keys(sostituzioni).forEach((k) => {
                s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), sostituzioni[k]);
            });
        }
        return s;
    }

    return { IT, t };
}));
