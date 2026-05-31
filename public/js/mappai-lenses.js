/**
 * mappai-lenses.js
 * Sistema Extraction Lenses per MappAI
 * Dipende da: app.js (appState, showToast, startGeneration)
 */

// ── Definizione Lenses ───────────────────────────────────

window.MAPPAI_LENSES = {

    // ── NARRATIVE ──────────────────────────────────────
    dates: {
        id: 'dates',
        icon: '\uD83D\uDCC5',
        label: 'Date e Periodi',
        group: 'narrative',
        color: '#dc2626',
        prompt: '[DATE]: NON creare nodi separati per anni/date. Incorpora la data nel label del nodo evento: scrivi "ANNO Evento" (es. "1968 Primavera di Praga", "1947 Piano Marshall", "1961 Muro di Berlino"). Per i personaggi, inserisci gli anni di carica/vita nel campo content, non come nodi separati.',
        tooltip: 'Le date vengono incorporate nel label del nodo evento (es. "1968 Primavera di Praga"), non come nodi separati'
    },
    people: {
        id: 'people',
        icon: '\uD83D\uDC64',
        label: 'Personaggi',
        group: 'narrative',
        color: '#7c3aed',
        prompt: '[PERSONAGGI]: Ogni nome proprio di persona \u2192 nodo con ruolo e contesto. Obbligatorio.',
        tooltip: 'Ogni personaggio storico o letterario ottiene un nodo dedicato'
    },
    places: {
        id: 'places',
        icon: '\uD83D\uDCCD',
        label: 'Luoghi',
        group: 'narrative',
        color: '#059669',
        prompt: '[LUOGHI]: Ogni toponimo significativo (citt\u00e0, stati, luoghi storici) \u2192 incluso esplicitamente.',
        tooltip: 'Citt\u00e0, paesi, luoghi storici appaiono nei nodi'
    },
    causes: {
        id: 'causes',
        icon: '\u26A1',
        label: 'Cause ed Effetti',
        group: 'narrative',
        color: '#d97706',
        prompt: '[CAUSE-EFFETTI]: Privilegia relazioni causali. Ogni causa principale \u2192 nodo con effetti figli.',
        tooltip: 'La mappa privilegia le relazioni causa-effetto tra eventi'
    },
    quotes: {
        id: 'quotes',
        icon: '\uD83D\uDCAC',
        label: 'Citazioni Chiave',
        group: 'narrative',
        color: '#0891b2',
        prompt: '[CITAZIONI]: Frasi celebri, discorsi, documenti ufficiali \u2192 estratti come nodi o chunks verbatim.',
        tooltip: 'Frasi storiche e documenti importanti vengono estratti'
    },

    // ── SCIENTIFIC ─────────────────────────────────────
    formulas: {
        id: 'formulas',
        icon: '\uD83E\uDDE2',
        label: 'Formule',
        group: 'stem',
        color: '#1d4ed8',
        prompt: '[FORMULE]: Ogni formula/equazione \u2192 nel content del nodo in notazione LaTeX tra $...$. Obbligatorio.',
        tooltip: 'Formule matematiche e fisiche in formato LaTeX'
    },
    reactions: {
        id: 'reactions',
        icon: '\u2697\uFE0F',
        label: 'Reazioni Chimiche',
        group: 'stem',
        color: '#7c3aed',
        prompt: '[REAZIONI]: Equazioni chimiche bilanciate \u2192 incluse nel content del nodo. Es: 2H\u2082+O\u2082\u21922H\u2082O.',
        tooltip: 'Equazioni chimiche bilanciate nei nodi'
    },
    definitions: {
        id: 'definitions',
        icon: '\uD83D\uDCD0',
        label: 'Definizioni Formali',
        group: 'stem',
        color: '#0f766e',
        prompt: '[DEFINIZIONI]: Ogni termine tecnico \u2192 definizione formale precisa nel desc (min 20 parole).',
        tooltip: 'Definizioni rigorose per ogni termine tecnico'
    },

    // ── TRASVERSALI ────────────────────────────────────
    keywords: {
        id: 'keywords',
        icon: '\uD83D\uDD11',
        label: 'Termini Chiave',
        group: 'transversal',
        color: '#ea580c',
        prompt: '[TERMINI]: Ogni termine disciplinare importante \u2192 desc con definizione chiara (min 15 parole).',
        tooltip: 'Potenzia il glossario con definizioni dettagliate'
    },
    exam: {
        id: 'exam',
        icon: '\u2753',
        label: "Domande d'Esame",
        group: 'transversal',
        color: '#b45309',
        prompt: "[ESAME]: Per ogni nodo L2+, aggiungi nel desc una possibile domanda d'esame sul concetto.",
        tooltip: "Ogni nodo include una potenziale domanda d'esame"
    },
    compare: {
        id: 'compare',
        icon: '\uD83D\uDDC2\uFE0F',
        label: 'Confronti',
        group: 'transversal',
        color: '#6d28d9',
        prompt: '[CONFRONTI]: Evidenzia somiglianze e differenze tra concetti paralleli. Crea nodi speculari.',
        tooltip: 'Mette in evidenza analogie e differenze'
    },
    data: {
        id: 'data',
        icon: '\uD83D\uDCCA',
        label: 'Dati e Numeri',
        group: 'transversal',
        color: '#0369a1',
        prompt: '[DATI]: Percentuali, statistiche, quantit\u00e0 \u2192 incluse nei nodi corrispondenti. Non omettere.',
        tooltip: 'Numeri, percentuali e statistiche nei nodi'
    }
};

// ── Preset Disciplinari ──────────────────────────────────

window.MAPPAI_PRESETS = {
    storia: {
        label: 'Storia',
        icon: '\uD83C\uDFDB\uFE0F',
        lenses: ['dates', 'people', 'places', 'causes'],
        focusSuggestion: 'Includi tutte le date, i personaggi e i luoghi storici presenti nel testo'
    },
    letteratura: {
        label: 'Letteratura',
        icon: '\uD83D\uDCDA',
        lenses: ['people', 'quotes', 'compare', 'keywords'],
        focusSuggestion: "Analizza personaggi, temi principali e citazioni significative dell'opera"
    },
    filosofia: {
        label: 'Filosofia',
        icon: '\uD83E\uDDE0',
        lenses: ['people', 'quotes', 'compare', 'definitions', 'exam'],
        focusSuggestion: 'Evidenzia i concetti chiave, gli autori e le correnti di pensiero'
    },
    scienze: {
        label: 'Scienze',
        icon: '\uD83D\uDD2C',
        lenses: ['formulas', 'definitions', 'reactions', 'data'],
        focusSuggestion: 'Includi formule, equazioni e definizioni formali di ogni concetto'
    },
    matematica: {
        label: 'Matematica',
        icon: '\uD83D\uDCD0',
        lenses: ['formulas', 'definitions', 'exam'],
        focusSuggestion: 'Includi ogni formula e teorema in notazione LaTeX tra $...$'
    },
    grammatica: {
        label: 'Grammatica',
        icon: '\u270F\uFE0F',
        lenses: ['definitions', 'compare', 'exam', 'keywords'],
        focusSuggestion: 'Crea nodi separati per ogni regola grammaticale con esempi pratici'
    }
};

// ── Stato lenses attive ──────────────────────────────────

window.activeLenses = new Set();

// ── Funzioni UI ──────────────────────────────────────────

/**
 * Attiva/disattiva una lens
 */
window.toggleLens = function (lensId) {
    var lens = window.MAPPAI_LENSES[lensId];
    if (!lens) return;

    if (window.activeLenses.has(lensId)) {
        window.activeLenses.delete(lensId);
    } else {
        window.activeLenses.add(lensId);
    }
    window.renderLensesUI();
    window.updateFocusFromLenses();
};

/**
 * Applica un preset disciplinare
 */
window.applyPreset = function (presetId) {
    var preset = window.MAPPAI_PRESETS[presetId];
    if (!preset) return;

    window.activeLenses.clear();
    preset.lenses.forEach(function (id) { window.activeLenses.add(id); });

    var focusInput = document.getElementById('focus-input');
    if (focusInput && !focusInput.value.trim()) {
        focusInput.value = preset.focusSuggestion;
    }

    window.renderLensesUI();
    window.updateFocusFromLenses();

    if (typeof window.showToast === 'function') {
        window.showToast(
            'Preset "' + preset.label + '" applicato \u2014 ' + preset.lenses.length + ' lenses attive',
            'success'
        );
    }
};

/**
 * Costruisce il testo delle lenses da aggiungere al prompt
 */
window.buildLensesPrompt = function () {
    if (window.activeLenses.size === 0) return '';

    var lines = ['\u26A1 EXTRACTION LENSES \u2014 SEGUIRE OBBLIGATORIAMENTE:'];
    window.activeLenses.forEach(function (id) {
        var lens = window.MAPPAI_LENSES[id];
        if (lens) lines.push(lens.prompt);
    });

    return lines.join('\n');
};

/**
 * Aggiorna appState.focusTopic combinando
 * il testo del campo focus con le lenses attive
 */
window.updateFocusFromLenses = function () {
    var focusInput = document.getElementById('focus-input');
    var userFocus = (focusInput && focusInput.value) ? focusInput.value.trim() : '';
    var lensesPrompt = window.buildLensesPrompt();

    var combined = [userFocus, lensesPrompt].filter(Boolean).join('\n\n');

    if (typeof appState !== 'undefined') {
        appState.focusTopic = combined;
    }
};

/**
 * Renderizza il pannello lenses nella landing page
 */
window.renderLensesUI = function () {
    var container = document.getElementById('lenses-panel');
    if (!container) return;

    var groups = {
        narrative:   { label: 'Discipline narrative',      lenses: [] },
        stem:        { label: 'Discipline scientifiche',   lenses: [] },
        transversal: { label: 'Trasversali',               lenses: [] }
    };

    Object.values(window.MAPPAI_LENSES).forEach(function (lens) {
        if (groups[lens.group]) groups[lens.group].lenses.push(lens);
    });

    var html = '';

    // Preset buttons
    html += '<div class="lenses-presets">';
    Object.keys(window.MAPPAI_PRESETS).forEach(function (id) {
        var preset = window.MAPPAI_PRESETS[id];
        html += '<button onclick="window.applyPreset(\'' + id + '\')" class="preset-btn" title="' + preset.focusSuggestion + '">' +
            preset.icon + ' ' + preset.label + '</button>';
    });
    html += '</div>';

    // Lens chips per gruppo
    Object.keys(groups).forEach(function (groupId) {
        var group = groups[groupId];
        if (group.lenses.length === 0) return;

        html += '<div class="lenses-group"><span class="lenses-group-label">' + group.label + '</span><div class="lenses-chips">';

        group.lenses.forEach(function (lens) {
            var active = window.activeLenses.has(lens.id);
            var activeStyle = active
                ? 'background:' + lens.color + ';color:white;border-color:' + lens.color + ';'
                : 'color:' + lens.color + ';border-color:' + lens.color + '40;';

            html += '<button onclick="window.toggleLens(\'' + lens.id + '\')" class="lens-chip' + (active ? ' active' : '') + '" style="' + activeStyle + '" title="' + lens.tooltip + '">' +
                lens.icon + ' ' + lens.label + '</button>';
        });

        html += '</div></div>';
    });

    container.innerHTML = html;
};

// ── CSS Lenses ───────────────────────────────────────────

(function addLensesStyles() {
    var style = document.createElement('style');
    style.textContent = [
        '#lenses-panel { margin-top: 12px; }',
        '.lenses-presets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }',
        '.preset-btn { padding: 5px 12px; border-radius: 999px; border: 1.5px solid #6366f1; background: #ede9fe; color: #4f46e5; font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.15s; font-family: inherit; }',
        '.preset-btn:hover { background: #6366f1; color: white; }',
        '.lenses-group { margin-bottom: 8px; }',
        '.lenses-group-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; display: block; margin-bottom: 5px; }',
        '.lenses-chips { display: flex; flex-wrap: wrap; gap: 5px; }',
        '.lens-chip { padding: 4px 10px; border-radius: 999px; border: 1.5px solid; background: white; font-size: 10px; font-weight: 600; cursor: pointer; transition: all 0.15s; font-family: inherit; }',
        '.lens-chip:hover { opacity: 0.85; transform: scale(1.03); }',
        '.lens-chip.active { box-shadow: 0 2px 6px rgba(0,0,0,0.15); }'
    ].join('\n');
    document.head.appendChild(style);
})();

// ── Init ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    window.renderLensesUI();

    var focusInput = document.getElementById('focus-input');
    if (focusInput) {
        focusInput.addEventListener('input', window.updateFocusFromLenses);
    }
});

console.log('[MappAI] mappai-lenses.js caricato \u2713');
