/*
 * mappai-relations.js — Tassonomia delle relazioni (Tier 1 extraction)
 * --------------------------------------------------------------------
 * Estratto da app.js senza alterarne il comportamento. Dati + classificatore PURI.
 * Modulo UMD: browser (window.*) + Node (require) per i test.
 *
 * Caricare in index.html PRIMA di app.js (app.js fa il binding a questo modulo).
 * Vedi docs/rules/07-relations-taxonomy.md
 *
 * API: window.MappAIRelations = { EDGE_FAMILIES, REL_FAMILY_MAP, getEdgeFamilyKey }
 * Alias globale: window.getEdgeFamilyKey
 *
 * NOTA: getActiveFamiliesInMap resta in app.js (dipende da appState, non è pura).
 * NOTA: l'estensione a 10 famiglie (Identity, Brother) per il Precision Teaching
 *       andrà fatta QUI (vedi docs/rules/07-relations-taxonomy.md).
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') {
        window.MappAIRelations = api;
        window.getEdgeFamilyKey = api.getEdgeFamilyKey;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const EDGE_FAMILIES = {
        trasformazione: {
            color: 'hsl(28,85%,52%)', colorBtn: 'hsl(28,85%,42%)', label: 'Causa / Effetto', icon: 'zap',
            keywords: ['causa', 'genera', 'produce', 'porta a', 'trasforma', 'provoca', 'determina']
        },
        dipendenza: {
            color: 'hsl(265,70%,58%)', colorBtn: 'hsl(265,70%,46%)', label: 'Dipendenza / Prerequisito', icon: 'link-2',
            keywords: ['richiede', 'dipende da', 'utilizza', 'permette', 'è necessario per', 'è condizione di']
        },
        sequenza: {
            color: 'hsl(200,80%,48%)', colorBtn: 'hsl(200,80%,38%)', label: 'Sequenza / Processo', icon: 'arrow-right',
            keywords: ['precede', 'segue', 'deriva da', 'porta a', 'avvia', 'è seguito da']
        },
        appartenenza: {
            color: 'hsl(220,65%,55%)', colorBtn: 'hsl(220,65%,44%)', label: 'Gerarchia / Parte di', icon: 'folder-tree',
            keywords: ['fa parte di', 'comprende', 'include', 'contiene', 'è esempio di', 'appartiene a']
        },
        regolazione: {
            color: 'hsl(315,55%,52%)', colorBtn: 'hsl(315,55%,42%)', label: 'Controllo / Regola', icon: 'sliders-horizontal',
            keywords: ['regola', 'governa', 'controlla', 'limita', 'guida', 'sostiene', 'avviene in']
        },
        opposizione: {
            color: 'hsl(15,75%,55%)', colorBtn: 'hsl(15,75%,44%)', label: 'Contrasto / Opposto', icon: 'shield-x',
            keywords: ['si oppone a', 'contrasta', 'esclude', 'differisce da', 'nega', 'ostacola']
        },
        analogia: {
            color: 'hsl(158,60%,40%)', colorBtn: 'hsl(158,60%,30%)', label: 'Analogia / Similitudine', icon: 'git-compare',
            keywords: ['è simile a', 'come', 'corrisponde a', 'assomiglia a', 'paragonabile a', 'richiama']
        },
        altro: {
            color: 'hsl(220,10%,55%)', colorBtn: 'hsl(220,10%,40%)', label: 'Altro / Libero', icon: 'circle-help',
            keywords: ['collega', 'riferisce a', 'associato a', 'vedi anche', 'è correlato a']
        }
    };

    // Mappa verbo → famiglia (normalizzato lowercase)
    const REL_FAMILY_MAP = {
        'causa': 'trasformazione', 'provoca': 'trasformazione', 'produce': 'trasformazione',
        'genera': 'trasformazione', 'determina': 'trasformazione', 'trasforma in': 'trasformazione',
        'porta a': 'trasformazione', 'alimenta': 'trasformazione', 'catalizza': 'trasformazione',
        'richiede': 'dipendenza', 'dipende da': 'dipendenza', 'è condizione di': 'dipendenza',
        'utilizza': 'dipendenza', 'permette': 'dipendenza',
        'precede': 'sequenza', 'segue': 'sequenza', 'deriva da': 'sequenza',
        'fa parte di': 'appartenenza', 'comprende': 'appartenenza', 'contiene': 'appartenenza',
        'appartiene a': 'appartenenza', 'è esempio di': 'appartenenza',
        'rappresenta': 'appartenenza', 'coinvolge': 'appartenenza',
        'è regolato da': 'regolazione', 'regola': 'regolazione', 'governa': 'regolazione',
        'guida': 'regolazione', 'sostiene': 'regolazione', 'avviene in': 'regolazione',
        'si oppone a': 'opposizione', 'contrasta': 'opposizione', 'ostacola': 'opposizione',
        'è simile a': 'analogia', 'come': 'analogia', 'corrisponde a': 'analogia',
        'assomiglia a': 'analogia', 'paragonabile a': 'analogia', 'richiama': 'analogia'
    };

    // Restituisce la famiglia per un rel (normalizzato, fallback 'altro')
    function getEdgeFamilyKey(rel) {
        if (!rel) return 'altro';
        const norm = String(rel).trim().toLowerCase();
        if (REL_FAMILY_MAP[norm]) return REL_FAMILY_MAP[norm];
        // fallback: match sulla prima parola
        const firstWord = norm.split(' ')[0];
        for (const [verb, fam] of Object.entries(REL_FAMILY_MAP)) {
            if (verb.startsWith(firstWord) || firstWord.startsWith(verb.split(' ')[0])) return fam;
        }
        return 'altro';
    }

    return { EDGE_FAMILIES, REL_FAMILY_MAP, getEdgeFamilyKey };
});
