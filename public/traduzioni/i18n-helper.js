/*
 * i18n-helper.js — helper di traduzione per i moduli JS
 * ------------------------------------------------------
 * Caricato in index.html SUBITO DOPO it_translations.js / en_translations.js
 * (deroga motivata alla regola "nuovi file dopo app.js": deve esistere prima
 * di qualunque modulo che costruisce UI via JS).
 *
 * Pattern d'uso nei moduli:
 *     showToast(window.t('toast_no_api_key', 'Inserisci API Key'), 'error');
 *
 * - Il 2° argomento è il testo ITALIANO originale, lasciato inline come
 *   fallback: con lingua 'it' il comportamento resta byte-identico anche se
 *   la chiave non è nel dizionario italiano.
 * - La traduzione inglese vive in en_translations.js sotto la stessa chiave.
 * - La valutazione avviene a runtime (momento del render), quindi il cambio
 *   lingua ha effetto sulla prossima apertura del modale/toast senza reload.
 */
window.t = function (key, fallback) {
    const lang = window.currentLanguage || localStorage.getItem('mappai_language') || 'it';
    const dict = (lang === 'en' || lang === 'en-US')
        ? (typeof en_translations !== 'undefined' ? en_translations : {})
        : (typeof it_translations !== 'undefined' ? it_translations : {});
    const val = dict[key];
    return (val !== undefined && val !== null && val !== '') ? val : (fallback !== undefined ? fallback : key);
};

/*
 * Lingua delle MAPPE (≠ lingua dell'interfaccia).
 * Impostazione mappai_map_language: 'ui' (default: segue l'interfaccia) |
 * 'it' | 'en' | 'auto' (lingua delle fonti caricate).
 * Governa: scelta template _IT/_EN, {{relVocabulary}}, prompt costruiti in JS.
 */
window.getMapLanguageSetting = function () {
    try { return localStorage.getItem('mappai_map_language') || 'ui'; } catch (e) { return 'ui'; }
};
// Risolve l'impostazione in 'it' | 'en' | 'auto'
window.getMapLanguage = function () {
    const s = window.getMapLanguageSetting();
    if (s !== 'ui') return s;
    const lang = window.currentLanguage || 'it';
    return (lang === 'en' || lang === 'en-US') ? 'en' : 'it';
};
// Lingua dei TESTI dei prompt (auto → lingua interfaccia, l'istruzione
// "rispondi nella lingua delle fonti" viene aggiunta a parte)
window.getPromptLanguage = function () {
    const m = window.getMapLanguage();
    if (m !== 'auto') return m;
    const lang = window.currentLanguage || 'it';
    return (lang === 'en' || lang === 'en-US') ? 'en' : 'it';
};

// Vocabolario linking words nella lingua delle mappe ('auto' → doppio IT+EN)
window.relVocab = function (style) {
    const R = window.MappAIRelations;
    if (!R || !R.buildRelVocabularyBlock) return '';
    const m = window.getMapLanguage();
    if (m === 'auto') {
        return R.buildRelVocabularyBlock(style, 'it')
            + (style === 'perFamily' ? '\n' : ', ')
            + R.buildRelVocabularyBlock(style, 'en');
    }
    return R.buildRelVocabularyBlock(style, m === 'en' ? 'en' : 'it');
};

// Istruzione esplicita di lingua output per i prompt costruiti in JS.
// Vuota quando la lingua mappe è l'italiano (comportamento storico invariato).
window.mapLangNote = function () {
    const m = window.getMapLanguage();
    if (m === 'en') return "\n⚠️ OUTPUT LANGUAGE: write every 'label', 'content', 'desc' and 'rel' in ENGLISH.\n";
    if (m === 'auto') return "\n⚠️ OUTPUT LANGUAGE: write every 'label', 'content', 'desc' and 'rel' in the SAME LANGUAGE as the provided sources (do NOT translate them).\n";
    return '';
};
