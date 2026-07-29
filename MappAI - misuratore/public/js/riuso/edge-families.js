/**
 * ┌─ COPIA DA MAPPAI — non modificare in loco ────────────────────────────────┐
 * │ Origine : public/js/mappai-relations.js  (MappAI re) — EDGE_FAMILIES      │
 * │ Commit  : 0751fa4 · Copiato il 28/07/2026                                 │
 * │ Motivo  : il componente 8 dell'indice (nessi logici, piano strutturale)   │
 * │           classifica i verbi di relazione per famiglia. Deve riconoscere  │
 * │           «causa», «richiede», «si oppone a» ESATTAMENTE come l'app.      │
 * │ RISCHIO : la regola 12 di MappAI dice che un verbo nuovo si aggiunge in   │
 * │           mappai-relations.js e si propaga ovunque. Qui NON si propaga.   │
 * │           tests/riuso-divergenza.test.js confronta le due liste e fallisce│
 * │           dicendo cosa aggiornare. Se fallisce, ricopiare da lì.          │
 * └───────────────────────────────────────────────────────────────────────────┘
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MisEdgeFamilies = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const EDGE_FAMILIES = {
        trasformazione: {
            label: 'Causa / Effetto', defaultRel: 'causa',
            keywords: ['causa', 'genera', 'produce', 'porta a', 'trasforma in', 'provoca', 'determina', 'alimenta', 'catalizza', 'è conseguenza di', 'fonda'],
            keywordsEn: ['causes', 'generates', 'produces', 'leads to', 'transforms into', 'triggers', 'determines', 'fuels', 'catalyzes', 'is a consequence of', 'founds']
        },
        dipendenza: {
            label: 'Dipendenza / Prerequisito', defaultRel: 'richiede',
            keywords: ['richiede', 'dipende da', 'utilizza', 'permette', 'è necessario per', 'è condizione di', 'sfrutta'],
            keywordsEn: ['requires', 'depends on', 'uses', 'enables', 'is necessary for', 'is a condition for', 'exploits']
        },
        sequenza: {
            label: 'Sequenza / Processo', defaultRel: 'precede',
            keywords: ['precede', 'segue', 'deriva da', 'avvia', 'è seguito da', 'evolve in', 'sviluppato in', 'scoperto da'],
            keywordsEn: ['precedes', 'follows', 'derives from', 'starts', 'is followed by', 'evolves into', 'developed in', 'discovered by']
        },
        appartenenza: {
            label: 'Gerarchia / Parte di', defaultRel: 'fa parte di',
            keywords: ['fa parte di', 'comprende', 'include', 'contiene', 'è esempio di', 'appartiene a', 'rappresenta', 'coinvolge', 'è formato da', 'compone', 'membro di'],
            keywordsEn: ['is part of', 'comprises', 'includes', 'contains', 'is an example of', 'belongs to', 'represents', 'involves', 'is made of', 'composes', 'member of']
        },
        regolazione: {
            label: 'Controllo / Regola', defaultRel: 'regola',
            keywords: ['regola', 'governa', 'controlla', 'limita', 'guida', 'sostiene', 'avviene in', 'è regolato da', 'influenza', 'finanzia', 'protegge', 'rafforza', 'giustifica', 'legittima', 'alleato di'],
            keywordsEn: ['regulates', 'governs', 'controls', 'limits', 'guides', 'supports', 'takes place in', 'is regulated by', 'influences', 'funds', 'protects', 'strengthens', 'justifies', 'legitimizes', 'allied with']
        },
        opposizione: {
            label: 'Contrasto / Opposto', defaultRel: 'si oppone a',
            keywords: ['si oppone a', 'contrasta', 'esclude', 'differisce da', 'nega', 'ostacola', 'impedisce', 'smaschera', 'condanna', 'contraddice'],
            keywordsEn: ['opposes', 'counters', 'excludes', 'differs from', 'denies', 'hinders', 'prevents', 'exposes', 'condemns', 'contradicts']
        },
        analogia: {
            label: 'Analogia / Similitudine', defaultRel: 'è simile a',
            keywords: ['è simile a', 'come', 'corrisponde a', 'assomiglia a', 'paragonabile a', 'richiama'],
            keywordsEn: ['is similar to', 'corresponds to', 'resembles', 'comparable to', 'echoes', 'like']
        },
        altro: {
            label: 'Altro / Libero', defaultRel: '',
            keywords: ['collega', 'riferisce a', 'associato a', 'vedi anche', 'è correlato a'],
            keywordsEn: ['relates to', 'refers to', 'associated with', 'see also']
        }
    };

    // 'include'/'includes' restano FUORI dalla mappa: sono la rel gerarchica di
    // default delle mappe mentali. Mapparle ad `appartenenza` classificherebbe
    // come «relazione ricca» l'intero albero. Stessa esclusione dell'originale.
    const MAP_EXCLUDED = new Set(['include', 'includes']);

    const REL_FAMILY_MAP = {};
    Object.keys(EDGE_FAMILIES).forEach((key) => {
        if (key === 'altro') return;
        const fam = EDGE_FAMILIES[key];
        fam.keywords.concat(fam.keywordsEn || []).forEach((verbo) => {
            if (MAP_EXCLUDED.has(verbo)) return;
            if (!REL_FAMILY_MAP[verbo]) REL_FAMILY_MAP[verbo] = key;
        });
    });

    // Famiglie che il componente 8 conta come «nesso logico dichiarato»:
    // un legame causale, condizionale o oppositivo esplicita un rapporto che
    // altrimenti lo studente dovrebbe inferire. Gerarchia e analogia no.
    const FAMIGLIE_LOGICHE = new Set(['trasformazione', 'dipendenza', 'opposizione']);

    function famigliaDi(rel) {
        const v = String(rel || '').trim().toLowerCase();
        if (!v) return 'altro';
        return REL_FAMILY_MAP[v] || 'altro';
    }

    function isGenerica(rel) {
        return MAP_EXCLUDED.has(String(rel || '').trim().toLowerCase());
    }

    function isLogica(rel) {
        return FAMIGLIE_LOGICHE.has(famigliaDi(rel));
    }

    // Elenco piatto di tutti i verbi, per il test di divergenza.
    function tuttiIVerbi() {
        const out = [];
        Object.keys(EDGE_FAMILIES).forEach((k) => {
            out.push(...EDGE_FAMILIES[k].keywords, ...(EDGE_FAMILIES[k].keywordsEn || []));
        });
        return out.sort();
    }

    return { EDGE_FAMILIES, REL_FAMILY_MAP, MAP_EXCLUDED, FAMIGLIE_LOGICHE,
             famigliaDi, isGenerica, isLogica, tuttiIVerbi };
}));
