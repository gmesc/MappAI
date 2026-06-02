/**
 * mappai-disciplines.js
 * Sistema di profili disciplinari per MappAI
 * Dipende da: app.js, mappai-lenses.js, admin_prompts.js
 */

window.activeDiscipline = null;

window.MAPPAI_DISCIPLINES = {
    storia: {
        label: 'Storia',
        icon: 'landmark',
        promptKey: 'DISCIPLINE_STORIA',
        lensPreset: 'storia',      // nome del preset in MAPPAI_PRESETS (mappai-lenses.js)
        lenses: ['dates', 'causes', 'people', 'places'],
        color: 'amber',
        bgClass: 'bg-amber-50 border-amber-300 text-amber-800',
        activeBgClass: 'bg-amber-500 border-amber-600 text-white'
    },
    scienze: {
        label: 'Scienze',
        icon: 'flask-conical',
        promptKey: 'DISCIPLINE_SCIENZE',
        lensPreset: 'scienze',
        lenses: ['definitions', 'data', 'formulas'],
        color: 'emerald',
        bgClass: 'bg-emerald-50 border-emerald-300 text-emerald-800',
        activeBgClass: 'bg-emerald-500 border-emerald-600 text-white'
    },
    letteratura: {
        label: 'Letteratura',
        icon: 'book-open',
        promptKey: 'DISCIPLINE_LETTERATURA',
        lensPreset: 'letteratura',
        lenses: ['people', 'quotes', 'compare', 'keywords'],
        color: 'purple',
        bgClass: 'bg-purple-50 border-purple-300 text-purple-800',
        activeBgClass: 'bg-purple-500 border-purple-600 text-white'
    },
    matematica: {
        label: 'Matematica',
        icon: 'sigma',
        promptKey: 'DISCIPLINE_MATEMATICA',
        lensPreset: 'matematica',
        lenses: ['formulas', 'definitions', 'exam'],
        color: 'blue',
        bgClass: 'bg-blue-50 border-blue-300 text-blue-800',
        activeBgClass: 'bg-blue-500 border-blue-600 text-white'
    },
    geografia: {
        label: 'Geografia',
        icon: 'map',
        promptKey: 'DISCIPLINE_GEOGRAFIA',
        lensPreset: null,
        lenses: ['places', 'causes', 'data'],
        color: 'teal',
        bgClass: 'bg-teal-50 border-teal-300 text-teal-800',
        activeBgClass: 'bg-teal-500 border-teal-600 text-white'
    },
    filosofia: {
        label: 'Filosofia',
        icon: 'scroll-text',
        promptKey: 'DISCIPLINE_FILOSOFIA',
        lensPreset: 'filosofia',
        lenses: ['people', 'quotes', 'compare', 'definitions'],
        color: 'rose',
        bgClass: 'bg-rose-50 border-rose-300 text-rose-800',
        activeBgClass: 'bg-rose-500 border-rose-600 text-white'
    }
};

// ── Selezione disciplina ─────────────────────────────────────

window.setDiscipline = function (key) {
    const prev = window.activeDiscipline;

    // Toggle off se stessa disciplina
    if (key && key === prev) {
        window.activeDiscipline = null;
    } else {
        window.activeDiscipline = key || null;
    }

    // Attiva le lenses della disciplina selezionata
    if (window.activeDiscipline && window.activeLenses && window.MAPPAI_DISCIPLINES[window.activeDiscipline]) {
        const disc = window.MAPPAI_DISCIPLINES[window.activeDiscipline];
        window.activeLenses.clear();

        // Usa il preset se disponibile, altrimenti imposta le lenses manualmente
        if (disc.lensPreset && window.MAPPAI_PRESETS && window.MAPPAI_PRESETS[disc.lensPreset]) {
            window.MAPPAI_PRESETS[disc.lensPreset].lenses.forEach(id => window.activeLenses.add(id));
        } else {
            disc.lenses.forEach(id => window.activeLenses.add(id));
        }

        if (typeof window.renderLensesUI === 'function') window.renderLensesUI();
        if (typeof window.updateFocusFromLenses === 'function') window.updateFocusFromLenses();
    } else if (!window.activeDiscipline) {
        // Deseleziona: pulisci lenses
        if (window.activeLenses) window.activeLenses.clear();
        if (typeof window.renderLensesUI === 'function') window.renderLensesUI();
        if (typeof window.updateFocusFromLenses === 'function') window.updateFocusFromLenses();
    }

    window.renderDisciplinePicker();
};

// ── Costruzione system prompt disciplinare ───────────────────

window.buildDisciplineSystemPrompt = function () {
    if (!window.activeDiscipline) return null;
    const disc = window.MAPPAI_DISCIPLINES[window.activeDiscipline];
    if (!disc) return null;

    // Costruisci hint profilo dal userProfile
    const grade = (window.appState && window.appState.userProfile && window.appState.userProfile.grade) || '';
    let profileHint = '';
    if (grade) {
        const gl = grade.toLowerCase();
        if (gl.includes('liceo') || gl.includes('gymnasium') || gl.includes('ginnasio')) {
            profileHint = 'Profilo destinatario: studente di Liceo. Usa terminologia disciplinare precisa e approfondi fino al dettaglio tecnico.';
        } else if (gl.includes('media') || gl.includes('mittelstufe') || gl.includes('scuola media')) {
            profileHint = 'Profilo destinatario: studente di scuola media (12-15 anni). Usa linguaggio accessibile, concetti concreti ed esempi pratici.';
        } else if (gl.includes('opi') || gl.includes('operatore')) {
            profileHint = 'Profilo destinatario: OPI (Operatore per l\'Inclusione). Includi spunti per la mediazione didattica dei contenuti.';
        } else if (gl.includes('elementar') || gl.includes('primaria')) {
            profileHint = 'Profilo destinatario: studente di scuola elementare. Usa solo concetti fondamentali, linguaggio semplice e visivo.';
        }
    }

    // Recupera il template da systemPromptsConfig (gestito da admin_prompts.js)
    if (typeof window.fillPromptTemplate === 'function') {
        const result = window.fillPromptTemplate(disc.promptKey, {
            profile: profileHint ? '\n\n' + profileHint : ''
        });
        if (result && result.trim()) return result;
    }

    return null;
};

// ── Rendering UI ─────────────────────────────────────────────

window.renderDisciplinePicker = function () {
    const container = document.getElementById('discipline-picker');
    if (!container) return;

    const disciplines = window.MAPPAI_DISCIPLINES;
    const active = window.activeDiscipline;

    let html = `<p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Area Disciplinare</p>`;
    html += `<div class="flex flex-wrap gap-2">`;

    // Bottone "Nessuna"
    const noneActive = !active;
    html += `
        <button type="button"
            onclick="window.setDiscipline(null)"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${noneActive ? 'bg-slate-500 border-slate-600 text-white' : 'bg-slate-50 border-slate-300 text-slate-500 hover:border-slate-400'}">
            <i data-lucide="x-circle" class="w-3 h-3"></i>
            Nessuna
        </button>`;

    // Bottoni disciplina
    for (const [key, disc] of Object.entries(disciplines)) {
        const isActive = active === key;
        const classes = isActive ? disc.activeBgClass : disc.bgClass + ' hover:opacity-80';
        html += `
        <button type="button"
            onclick="window.setDiscipline('${key}')"
            title="${disc.label}"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${classes}">
            <i data-lucide="${disc.icon}" class="w-3 h-3"></i>
            ${disc.label}
        </button>`;
    }

    html += `</div>`;

    // Mostra lenses attive come badge se c'è una disciplina selezionata
    if (active && window.activeLenses && window.activeLenses.size > 0) {
        html += `<div class="mt-2 flex flex-wrap gap-1 items-center">
            <span class="text-[10px] text-slate-400">Lenses attive:</span>`;
        window.activeLenses.forEach(id => {
            const lens = window.MAPPAI_LENSES && window.MAPPAI_LENSES[id];
            if (lens) {
                html += `<span class="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500">${lens.label}</span>`;
            }
        });
        html += `</div>`;
    }

    container.innerHTML = html;
    if (window.safeCreateIcons) window.safeCreateIcons();
};

// ── Init al caricamento ───────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    // Piccolo delay per essere sicuri che mappai-lenses.js abbia finito di renderizzare
    setTimeout(window.renderDisciplinePicker, 100);
});
