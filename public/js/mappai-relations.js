/*
 * mappai-relations.js — Tassonomia delle relazioni (Tier 1 extraction)
 * --------------------------------------------------------------------
 * Estratto da app.js senza alterarne il comportamento. Dati + classificatore PURI.
 * Modulo UMD: browser (window.*) + Node (require) per i test.
 *
 * Caricare in index.html PRIMA di app.js (app.js fa il binding a questo modulo).
 * Vedi docs/rules/07-relations-taxonomy.md
 *
 * ⭐ SINGLE SOURCE OF TRUTH delle linking words (6 lug 2026):
 * i keywords di EDGE_FAMILIES sono l'UNICO elenco di verbi dell'app.
 * - buildRelVocabularyBlock() genera il blocco vocabolario per i prompt
 *   (Fase 3 MM, Fase 4, KG Community, KG multi-pass, template JSON via
 *   il placeholder {{relVocabulary}} riempito da fillPromptTemplate).
 * - REL_FAMILY_MAP (verbo → famiglia) è GENERATA dai keywords: un verbo
 *   aggiunto qui viene proposto all'AI E classificato col colore giusto.
 * Per aggiungere un verbo: UNA riga nei keywords della famiglia giusta.
 * NON hardcodare mai liste di verbi nei prompt.
 *
 * 🌍 BILINGUE (7 lug 2026): ogni famiglia ha anche keywordsEn + labelEn.
 * REL_FAMILY_MAP contiene ENTRAMBE le lingue (i verbi non collidono), così
 * le mappe generate in inglese hanno frecce classificate e colorate.
 * buildRelVocabularyBlock(style, lang) / getFamilyVerbs(key, lang) /
 * getFamilyLabel(key, lang) accettano lang 'it' (default) | 'en'.
 *
 * API: window.MappAIRelations = { EDGE_FAMILIES, REL_FAMILY_MAP,
 *      getEdgeFamilyKey, getFamilyVerbs, getFamilyLabel, getFamilyDefaultRel,
 *      buildRelVocabularyBlock }
 * Alias globale: window.getEdgeFamilyKey
 *
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

    // I primi 3 keywords di ogni famiglia compaiono come hint nel modale
    // link manuale (mappai-ui-modals.js) → tenere i più canonici in testa.
    // defaultRel = verbo pre-compilato nel modale quando si sceglie la famiglia.
    const EDGE_FAMILIES = {
        trasformazione: {
            color: 'hsl(28,85%,52%)', colorBtn: 'hsl(28,85%,42%)', label: 'Causa / Effetto', labelEn: 'Cause / Effect', icon: 'zap',
            defaultRel: 'causa', defaultRelEn: 'causes',
            keywords: ['causa', 'genera', 'produce', 'porta a', 'trasforma in', 'provoca', 'determina', 'alimenta', 'catalizza', 'è conseguenza di', 'fonda'],
            keywordsEn: ['causes', 'generates', 'produces', 'leads to', 'transforms into', 'triggers', 'determines', 'fuels', 'catalyzes', 'is a consequence of', 'founds']
        },
        dipendenza: {
            color: 'hsl(265,70%,58%)', colorBtn: 'hsl(265,70%,46%)', label: 'Dipendenza / Prerequisito', labelEn: 'Dependency / Prerequisite', icon: 'link-2',
            defaultRel: 'richiede', defaultRelEn: 'requires',
            keywords: ['richiede', 'dipende da', 'utilizza', 'permette', 'è necessario per', 'è condizione di', 'sfrutta'],
            keywordsEn: ['requires', 'depends on', 'uses', 'enables', 'is necessary for', 'is a condition for', 'exploits']
        },
        sequenza: {
            color: 'hsl(200,80%,48%)', colorBtn: 'hsl(200,80%,38%)', label: 'Sequenza / Processo', labelEn: 'Sequence / Process', icon: 'arrow-right',
            defaultRel: 'precede', defaultRelEn: 'precedes',
            keywords: ['precede', 'segue', 'deriva da', 'avvia', 'è seguito da', 'evolve in', 'sviluppato in', 'scoperto da'],
            keywordsEn: ['precedes', 'follows', 'derives from', 'starts', 'is followed by', 'evolves into', 'developed in', 'discovered by']
        },
        appartenenza: {
            color: 'hsl(220,65%,55%)', colorBtn: 'hsl(220,65%,44%)', label: 'Gerarchia / Parte di', labelEn: 'Hierarchy / Part of', icon: 'folder-tree',
            defaultRel: 'fa parte di', defaultRelEn: 'is part of',
            keywords: ['fa parte di', 'comprende', 'include', 'contiene', 'è esempio di', 'appartiene a', 'rappresenta', 'coinvolge', 'è formato da', 'compone', 'membro di'],
            keywordsEn: ['is part of', 'comprises', 'includes', 'contains', 'is an example of', 'belongs to', 'represents', 'involves', 'is made of', 'composes', 'member of']
        },
        regolazione: {
            color: 'hsl(315,55%,52%)', colorBtn: 'hsl(315,55%,42%)', label: 'Controllo / Regola', labelEn: 'Control / Rule', icon: 'sliders-horizontal',
            defaultRel: 'regola', defaultRelEn: 'regulates',
            keywords: ['regola', 'governa', 'controlla', 'limita', 'guida', 'sostiene', 'avviene in', 'è regolato da', 'influenza', 'finanzia', 'protegge', 'rafforza', 'giustifica', 'legittima', 'alleato di'],
            keywordsEn: ['regulates', 'governs', 'controls', 'limits', 'guides', 'supports', 'takes place in', 'is regulated by', 'influences', 'funds', 'protects', 'strengthens', 'justifies', 'legitimizes', 'allied with']
        },
        opposizione: {
            color: 'hsl(15,75%,55%)', colorBtn: 'hsl(15,75%,44%)', label: 'Contrasto / Opposto', labelEn: 'Contrast / Opposite', icon: 'shield-x',
            defaultRel: 'si oppone a', defaultRelEn: 'opposes',
            keywords: ['si oppone a', 'contrasta', 'esclude', 'differisce da', 'nega', 'ostacola', 'impedisce', 'smaschera', 'condanna', 'contraddice'],
            keywordsEn: ['opposes', 'counters', 'excludes', 'differs from', 'denies', 'hinders', 'prevents', 'exposes', 'condemns', 'contradicts']
        },
        analogia: {
            color: 'hsl(158,60%,40%)', colorBtn: 'hsl(158,60%,30%)', label: 'Analogia / Similitudine', labelEn: 'Analogy / Similarity', icon: 'git-compare',
            defaultRel: 'è simile a', defaultRelEn: 'is similar to',
            keywords: ['è simile a', 'come', 'corrisponde a', 'assomiglia a', 'paragonabile a', 'richiama'],
            keywordsEn: ['is similar to', 'corresponds to', 'resembles', 'comparable to', 'echoes', 'like']
        },
        altro: {
            color: 'hsl(220,10%,55%)', colorBtn: 'hsl(220,10%,40%)', label: 'Altro / Libero', labelEn: 'Other / Free', icon: 'circle-help',
            defaultRel: '', defaultRelEn: '',
            keywords: ['collega', 'riferisce a', 'associato a', 'vedi anche', 'è correlato a'],
            keywordsEn: ['relates to', 'refers to', 'associated with', 'see also']
        }
    };

    // Mappa verbo → famiglia, GENERATA dai keywords di ENTRAMBE le lingue
    // (famiglia 'altro' esclusa). 'include'/'includes' restano fuori dalla mappa:
    // sono le rel di default delle MM e da sempre vengono classificate 'altro' —
    // mapparle ad appartenenza colorerebbe di blu l'intero albero nella Lente
    // Relazioni (cambio visivo indesiderato).
    const MAP_EXCLUDED = new Set(['include', 'includes']);
    const REL_FAMILY_MAP = {};
    Object.keys(EDGE_FAMILIES).forEach((key) => {
        if (key === 'altro') return;
        const fam = EDGE_FAMILIES[key];
        (fam.keywords.concat(fam.keywordsEn || [])).forEach((verb) => {
            if (MAP_EXCLUDED.has(verb)) return;
            if (!REL_FAMILY_MAP[verb]) REL_FAMILY_MAP[verb] = key;
        });
    });

    // Verbi mai proposti all'AI nei prompt: 'include(s)' è la rel gerarchica di
    // default (scoraggiata quando si vogliono linking words ricche), 'come'/'like'
    // sono ambigui fuori dal contesto del modale manuale.
    const PROMPT_EXCLUDED_VERBS = new Set(['include', 'includes', 'come', 'like']);

    function _kwList(fam, lang) {
        return (lang === 'en') ? (fam.keywordsEn || []) : fam.keywords;
    }

    // Verbi di una famiglia proponibili all'AI ([] per 'altro': sono i generici vietati)
    function getFamilyVerbs(familyKey, lang) {
        const fam = EDGE_FAMILIES[familyKey];
        if (!fam || familyKey === 'altro') return [];
        return _kwList(fam, lang).filter(v => !PROMPT_EXCLUDED_VERBS.has(v));
    }

    // Etichetta della famiglia nella lingua richiesta (per modale link, legenda, giochi)
    function getFamilyLabel(familyKey, lang) {
        const fam = EDGE_FAMILIES[familyKey];
        if (!fam) return familyKey;
        return (lang === 'en' && fam.labelEn) ? fam.labelEn : fam.label;
    }

    // Verbo default della famiglia (pre-compilato nel modale link manuale)
    function getFamilyDefaultRel(familyKey, lang) {
        const fam = EDGE_FAMILIES[familyKey];
        if (!fam) return '';
        return (lang === 'en') ? (fam.defaultRelEn || '') : (fam.defaultRel || '');
    }

    // Blocco vocabolario da iniettare nei prompt di generazione.
    // style 'perFamily' → una riga per famiglia "- Label: v1, v2" (prompt MM Fase 3)
    // style 'flat' (default) → elenco piatto '"v1", "v2", ...' (KG, Fase 4, {{relVocabulary}})
    // lang 'it' (default) | 'en'
    function buildRelVocabularyBlock(style, lang) {
        const fams = Object.keys(EDGE_FAMILIES).filter(k => k !== 'altro');
        if (style === 'perFamily') {
            return fams.map(k => `- ${getFamilyLabel(k, lang)}: ${getFamilyVerbs(k, lang).join(', ')}`).join('\n');
        }
        return fams.map(k => getFamilyVerbs(k, lang).map(v => `"${v}"`).join(', ')).join(', ');
    }

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

    return { EDGE_FAMILIES, REL_FAMILY_MAP, getEdgeFamilyKey, getFamilyVerbs, getFamilyLabel, getFamilyDefaultRel, buildRelVocabularyBlock };
});
