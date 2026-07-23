window.systemPromptsConfig = {};
window.systemPromptsDescriptions = {
    "DISCIPLINE_STORIA": "System prompt disciplinare: Storia",
    "DISCIPLINE_SCIENZE": "System prompt disciplinare: Scienze Naturali",
    "DISCIPLINE_LETTERATURA": "System prompt disciplinare: Letteratura / Italiano",
    "DISCIPLINE_MATEMATICA": "System prompt disciplinare: Matematica",
    "DISCIPLINE_GEOGRAFIA": "System prompt disciplinare: Geografia",
    "DISCIPLINE_FILOSOFIA": "System prompt disciplinare: Filosofia",
    "L1_MACRO_CATEGORIES": "admin_prompt_desc_l1",
    "MIND_MAP_FULL_TREE": "admin_prompt_desc_mm_full",
    "KNOWLEDGE_GRAPH_FULL_TREE": "admin_prompt_desc_kg_full",
    "KNOWLEDGE_GRAPH_SINGLE": "admin_prompt_desc_kg",
    "SEMANTIC_CORRELATION": "admin_prompt_desc_merge",
    "MULTIPLE_CHOICE_QUIZ": "admin_prompt_desc_quiz_flash",
    "SINGLE_QUIZ_TUTOR": "admin_prompt_desc_quiz_tutor",
    "SOCRATIC_TUTOR_IT": "admin_prompt_desc_socratic_it",
    "SOCRATIC_TUTOR_EN": "admin_prompt_desc_socratic_en",
    "SOCRATIC_TUTOR": "admin_prompt_desc_socratic_it",
    "TUTOR_MODE_EXPLAIN": "admin_prompt_desc_mode_explain",
    "TUTOR_MODE_ASK": "admin_prompt_desc_mode_ask",
    "TUTOR_MODE_SOCRATIC": "admin_prompt_desc_mode_socratic",
    "TUTOR_MODE_DEVIL": "admin_prompt_desc_mode_devil",
    "TUTOR_MODE_CONNECT": "admin_prompt_desc_mode_connect",
    "TUTOR_MODE_RECALL": "admin_prompt_desc_mode_recall",
    "SOTA_SECOND_BRAIN": "admin_prompt_desc_sota",
    "DYNAMIC_QUIZ": "admin_prompt_desc_dynamic_quiz",
    "FLASHCARD_GENERATOR": "admin_prompt_desc_flashcards",
    "MIND_MAP_FULL_TREE_IT": "admin_prompt_desc_mm_full",
    "MIND_MAP_FULL_TREE_EN": "admin_prompt_desc_mm_full",
    "KNOWLEDGE_GRAPH_FULL_TREE_IT": "admin_prompt_desc_kg_full",
    "KNOWLEDGE_GRAPH_FULL_TREE_EN": "admin_prompt_desc_kg_full",
    "NPC_NARRATOR": "admin_prompt_desc_npc_narrator"
};

window.systemPromptsCategories = {
    "MINDMAPS": ["L1_MACRO_CATEGORIES", "MIND_MAP_FULL_TREE"],
    "KGRAPHS": ["KNOWLEDGE_GRAPH_FULL_TREE", "KNOWLEDGE_GRAPH_SINGLE", "SEMANTIC_CORRELATION", "SOTA_SECOND_BRAIN"],
    "TUTOR": ["SINGLE_QUIZ_TUTOR", "SOCRATIC_TUTOR", "TUTOR_MODE_EXPLAIN", "TUTOR_MODE_ASK", "TUTOR_MODE_SOCRATIC", "TUTOR_MODE_DEVIL", "TUTOR_MODE_CONNECT", "TUTOR_MODE_RECALL"],
    "STUDY": ["MULTIPLE_CHOICE_QUIZ", "DYNAMIC_QUIZ", "FLASHCARD_GENERATOR"],
    "DISCIPLINES": ["DISCIPLINE_STORIA", "DISCIPLINE_SCIENZE", "DISCIPLINE_LETTERATURA", "DISCIPLINE_MATEMATICA", "DISCIPLINE_GEOGRAFIA", "DISCIPLINE_FILOSOFIA"],
    "NPC": ["NPC_NARRATOR"]
};

// Helper per ottenere la traduzione corrente
window.getAdminTranslation = function(key) {
    const lang = window.currentLanguage || 'it';
    let dict = {};
    if (lang === 'it') {
        dict = (typeof it_translations !== 'undefined' ? it_translations : (window.it_translations || {}));
    } else {
        dict = (typeof en_translations !== 'undefined' ? en_translations : (window.en_translations || {}));
    }
    return dict[key] || key;
};

window.systemTabExplanations = {
    "MINDMAPS": "admin_explanation_mindmaps",
    "KGRAPHS": "admin_explanation_kgraphs",
    "TUTOR": "admin_explanation_tutor",
    "STUDY": "admin_explanation_study",
    "NPC": "admin_explanation_npc"
};

window.currentAdminPromptKey = null;
window.currentAdminTab = "MINDMAPS";

// Helper function to fill variables in prompt string
window.fillPromptTemplate = function(promptKey, variables) {
    // Suffisso template dalla LINGUA MAPPE (mappai_map_language), non dall'interfaccia.
    // Default 'ui' → segue l'interfaccia: comportamento storico invariato.
    const promptLang = (typeof window.getPromptLanguage === 'function')
        ? window.getPromptLanguage()
        : ((window.currentLanguage === 'en' || window.currentLanguage === 'en-US') ? 'en' : 'it');
    const langSuffix = promptLang === 'en' ? '_EN' : '_IT';
    
    let text = "";
    // Seleziona preferenzialmente i prompt specifici per Infomaniak se il provider è attivo
    if (window.appState && window.appState.aiProvider === 'infomaniak') {
        text = window.systemPromptsConfig[promptKey + "_INFOMANIAK" + langSuffix] || window.systemPromptsConfig[promptKey + "_INFOMANIAK"] || "";
    }
    
    if (!text) {
        // Toggle "logica MM": se l'utente sceglie la logica sperimentale BERT, usa la
        // variante _BERT del prompt L1 (con la REGOLA DI PERTINENZA). Default = MappAI.
        let resolvedKey = promptKey;
        try {
            if (promptKey === 'L1_MACRO_CATEGORIES' && localStorage.getItem('mappai_mm_logic') === 'bert') {
                resolvedKey = 'L1_MACRO_CATEGORIES_BERT';
            }
        } catch (e) { /* localStorage non disponibile */ }
        text = window.systemPromptsConfig[resolvedKey + langSuffix] || window.systemPromptsConfig[resolvedKey] ||
               window.systemPromptsConfig[promptKey + langSuffix] || window.systemPromptsConfig[promptKey] || "";
    }
    
    for (const [key, value] of Object.entries(variables || {})) {
        // Replacer FUNZIONE (non stringa): inserisce il valore LETTERALE. Con la stringa,
        // JS interpreta le sequenze speciali ($$ → $, $& → match, ecc.) e corrompe i valori
        // con delimitatori KaTeX $$…$$ (es. {{nodeContent}} = desc con formule).
        text = text.replace(new RegExp(`{{${key}}}`, 'g'), () => String(value == null ? '' : value));
    }
    // {{relVocabulary}}: vocabolario linking words centralizzato (mappai-relations.js).
    // Riempito qui per OGNI template, senza che i chiamanti debbano passarlo.
    // Lingua mappe 'auto' → vocabolario doppio (IT + EN): l'AI pesca nella lingua delle fonti.
    if (text.indexOf('{{relVocabulary}}') !== -1) {
        let vocab = '';
        if (window.MappAIRelations && window.MappAIRelations.buildRelVocabularyBlock) {
            const mapLang = (typeof window.getMapLanguage === 'function') ? window.getMapLanguage() : 'it';
            vocab = (mapLang === 'auto')
                ? window.MappAIRelations.buildRelVocabularyBlock('flat', 'it') + ', ' + window.MappAIRelations.buildRelVocabularyBlock('flat', 'en')
                : window.MappAIRelations.buildRelVocabularyBlock('flat', mapLang === 'en' ? 'en' : 'it');
        }
        text = text.replace(/{{relVocabulary}}/g, vocab);
    }
    // Lingua mappe 'auto' + prompt di generazione (contiene le fonti):
    // istruzione esplicita di rispondere nella lingua delle fonti.
    try {
        if (typeof window.getMapLanguage === 'function' && window.getMapLanguage() === 'auto'
            && /\{\{textParts\}\}|FONTI DA ANALIZZARE|SOURCES TO ANALYZE/i.test(text + (window.systemPromptsConfig[promptKey + langSuffix] || ''))) {
            text += "\n\n⚠️ OUTPUT LANGUAGE: write every 'label', 'content', 'desc' and 'rel' in the SAME LANGUAGE as the provided sources (do NOT translate them).";
        }
    } catch (e) { /* no-op */ }
    return text;
};

// Keyboard listener for CTRL+SHIFT+P+O+I+U (sequential to prevent stuck keys)
let adminKeys = [];
const adminSecret = ['p', 'o', 'i', 'u'];
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey) {
        const key = e.key.toLowerCase();
        if (adminSecret.includes(key)) {
            adminKeys.push(key);
            if (adminKeys.length > 4) adminKeys.shift();
            if (adminKeys.join('') === 'poiu') {
                window.openAdminDashboard();
                adminKeys = [];
                e.preventDefault();
            }
        } else {
            adminKeys = [];
        }
    } else {
        adminKeys = [];
    }
});

window.openAdminDashboard = async function() {
    document.getElementById('admin-dashboard').classList.remove('hidden');
    document.getElementById('admin-dashboard').classList.add('flex');
    
    // Configura le traduzioni dei bottoni di ripristino
    const resetLabelEl = document.getElementById('admin-btn-reset-label');
    if (resetLabelEl) {
        resetLabelEl.innerText = window.getAdminTranslation('admin_btn_reset') || 'Ripristina Default';
    }
    const resetAllLabelEl = document.getElementById('admin-btn-reset-all-label');
    if (resetAllLabelEl) {
        resetAllLabelEl.innerText = window.getAdminTranslation('admin_btn_reset_all') || 'Ripristina Tutti i Prompt';
    }
    
    // Load config if empty
    if (Object.keys(window.systemPromptsConfig).length === 0) {
        await window.loadPromptsConfig();
    }
    
    await window.renderAdminPromptsList();
    if (window.lucide) window.lucide.createIcons();
};

window.closeAdminDashboard = function() {
    document.getElementById('admin-dashboard').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('flex');
    document.getElementById('admin-test-area').classList.add('hidden');
};

window.loadPromptsConfig = async function() {
    if (window.electronAPI && window.electronAPI.loadPrompts) {
        const res = await window.electronAPI.loadPrompts();
        if (res.success && res.data) {
            window.systemPromptsConfig = res.data;
        } else {
            console.error("Failed to load prompts config:", res.error);
        }
    }
};

window.renderAdminPromptsList = async function() {
    // Forza il caricamento se la lista è vuota
    if (Object.keys(window.systemPromptsConfig).length === 0) {
        await window.loadPromptsConfig();
    }

    const listEl = document.getElementById('admin-prompts-list');
    const explanationEl = document.getElementById('admin-tab-explanation');
    if (!listEl) return;
    listEl.innerHTML = '';
    
    // Update explanation
    if (explanationEl) {
        const explKey = window.systemTabExplanations[window.currentAdminTab];
        explanationEl.innerText = window.getAdminTranslation(explKey) || "";
    }

    // Update tab UI labels and selection
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        const tab = btn.getAttribute('data-tab');
        if (tab === 'MINDMAPS') btn.innerText = window.getAdminTranslation('admin_tab_mindmaps');
        if (tab === 'KGRAPHS') btn.innerText = window.getAdminTranslation('admin_tab_kgraphs');
        if (tab === 'TUTOR') btn.innerText = window.getAdminTranslation('admin_tab_tutor');
        if (tab === 'STUDY') btn.innerText = window.getAdminTranslation('admin_tab_study');

        if (tab === window.currentAdminTab) {
            btn.classList.add('bg-indigo-600', 'text-white');
            btn.classList.remove('bg-slate-100', 'text-slate-600');
        } else {
            btn.classList.remove('bg-indigo-600', 'text-white');
            btn.classList.add('bg-slate-100', 'text-slate-600');
        }
    });

    const categories = window.systemPromptsCategories[window.currentAdminTab] || [];
    const allKeys = Object.keys(window.systemPromptsConfig);
    
    // Sort keys: prima quelli in categoria, poi alfabeticamente
    allKeys.sort((a, b) => a.localeCompare(b));

    let foundAny = false;
    for (const key of allKeys) {
        // Pulizia aggressiva della chiave per il matching con la categoria
        const baseKey = key.split('_IT')[0].split('_EN')[0].split('_INFOMANIAK')[0].split('_STUDENT')[0];
        
        const isInCurrentTab = categories.includes(baseKey) || categories.includes(key);
        if (!isInCurrentTab) continue;

        foundAny = true;
        const btn = document.createElement('button');
        btn.className = `w-full text-left p-3 rounded-lg border border-slate-200 transition-colors text-sm hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-2 ${window.currentAdminPromptKey === key ? 'bg-indigo-50 border-indigo-300' : 'bg-slate-50'}`;
        
        const descKey = window.systemPromptsDescriptions[key] || window.systemPromptsDescriptions[baseKey];
        const descText = descKey ? window.getAdminTranslation(descKey) : "Prompt di sistema";

        btn.innerHTML = `
            <div class="font-bold text-slate-800 text-xs">${key}</div>
            <div class="text-[11px] text-slate-600 line-clamp-2">${descText}</div>
        `;
        
        btn.onclick = () => window.selectAdminPrompt(key);
        listEl.appendChild(btn);
    }

    if (!foundAny) {
        listEl.innerHTML = '<div class="text-center p-10 text-slate-400 text-xs italic">Nessun prompt trovato in questa categoria.</div>';
    }

    // Tab NPC: bottone pinned "Gestione modello & opzioni" in cima alla lista
    if (window.currentAdminTab === 'NPC') {
        listEl.insertAdjacentHTML('afterbegin',
            '<button onclick="window.MappAINpcAdmin && window.MappAINpcAdmin.openManagement()" ' +
            'class="w-full text-left p-3 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold mb-2 hover:bg-indigo-100 flex items-center gap-2">' +
            '<span style="font-family:var(--emoji-font)">🤖</span> Gestione modello &amp; opzioni</button>');
    }

    // Empty-state editor: mostra il robot finché nessun prompt è selezionato
    const emptyState = document.getElementById('admin-empty-state');
    if (emptyState) emptyState.style.display = window.currentAdminPromptKey ? 'none' : 'flex';

    // Pannello gestione NPC (overlay nell'editor) in base al tab attivo
    if (window.MappAINpcAdmin) window.MappAINpcAdmin.syncWithTab(window.currentAdminTab, window.currentAdminPromptKey);
};

window.switchAdminTab = function(tab) {
    window.currentAdminTab = tab;
    // Entrando nel tab NPC, deseleziona il prompt → mostra subito il pannello gestione
    if (tab === 'NPC') window.currentAdminPromptKey = null;
    window.renderAdminPromptsList();
};

window.selectAdminPrompt = function(key) {
    window.currentAdminPromptKey = key;
    const baseKey = key.replace(/_(INFOMANIAK|IT|EN|STUDENT).*/g, '');
    const descKey = window.systemPromptsDescriptions[key] || window.systemPromptsDescriptions[baseKey];
    
    document.getElementById('admin-prompt-title').innerText = key;
    document.getElementById('admin-prompt-desc').innerText = window.getAdminTranslation(descKey);
    document.getElementById('admin-prompt-editor').value = window.systemPromptsConfig[key];
    window.renderAdminPromptsList();
};

window.saveCurrentPrompt = async function() {
    if (!window.currentAdminPromptKey) return;
    
    const newVal = document.getElementById('admin-prompt-editor').value;
    window.systemPromptsConfig[window.currentAdminPromptKey] = newVal;
    
    if (window.electronAPI && window.electronAPI.savePrompts) {
        const res = await window.electronAPI.savePrompts(window.systemPromptsConfig);
        if (res.success) {
            if(window.showToast) window.showToast('Prompt salvato con successo!', 'success');
            else alert('Salvato con successo!');
        } else {
            if(window.showToast) window.showToast('Errore salvataggio: ' + res.error, 'error');
            else alert('Errore salvataggio: ' + res.error);
        }
    }
};

window.testPrompt = function() {
    document.getElementById('admin-test-area').classList.remove('hidden');
    document.getElementById('admin-test-area').classList.add('flex');
    if (!document.getElementById('admin-test-input').value) {
        document.getElementById('admin-test-input').value = 'Metti un input o fonte di test qui...';
    }
};

window.runAIPromptTest = async function() {
    const inputContent = document.getElementById('admin-test-input').value;
    const promptText = document.getElementById('admin-prompt-editor').value;
    const outputEl = document.getElementById('admin-test-output');
    
    const apiKey = window.getSystemKey ? window.getSystemKey() : localStorage.getItem('gemini_api_key');
    if (!apiKey) {
        outputEl.value = 'ERRORE: API Key non configurata in MappAI.';
        return;
    }
    
    outputEl.value = 'In attesa di Gemini...';
    
    const finalPrompt = promptText.replace(/{{.*?}}/g, inputContent); // Simple replacement for test
    
    const payload = {
        contents: [{ parts: [{ text: finalPrompt + "\\n\\nTesto Utente:\\n" + inputContent }] }],
        generationConfig: { temperature: 0.2 }
    };
    
    try {
        if (window.MappAIUsage) window.MappAIUsage.setContext('other', 'admin_test');
        const res = await window.fetchModelAPI(payload, apiKey);
        if (res && res.candidates && res.candidates[0]) {
            outputEl.value = res.candidates[0].content.parts[0].text;
        } else {
            outputEl.value = "Errore sconosciuto nella risposta.";
        }
    } catch(err) {
        outputEl.value = "ERRORE: " + err.message;
    }
};

window.resetCurrentPrompt = async function() {
    if (!window.currentAdminPromptKey) return;
    
    const confirmMsg = window.getAdminTranslation('admin_confirm_reset_prompt') || 'Ripristinare questo prompt al valore originale di default?';
    if (!confirm(confirmMsg)) return;
    
    try {
        const response = await fetch('./prompts_default.json');
        if (response.ok) {
            const defaultPrompts = await response.json();
            const defaultVal = defaultPrompts[window.currentAdminPromptKey];
            if (defaultVal !== undefined) {
                document.getElementById('admin-prompt-editor').value = defaultVal;
                
                // Aggiorna la configurazione locale in memoria
                window.systemPromptsConfig[window.currentAdminPromptKey] = defaultVal;
                
                // Salva le modifiche usando il canale adeguato
                if (window.electronAPI && window.electronAPI.savePrompts) {
                    await window.electronAPI.savePrompts(window.systemPromptsConfig);
                } else if (window.storageAdapter && window.storageAdapter.savePrompts) {
                    await window.storageAdapter.savePrompts(window.systemPromptsConfig);
                } else {
                    localStorage.setItem("mappai_custom_prompts", JSON.stringify(window.systemPromptsConfig));
                }
                
                if (window.showToast) window.showToast('Prompt ripristinato al valore di default con successo!', 'success');
                else alert('Ripristinato al valore di default!');
            } else {
                if (window.showToast) window.showToast('Nessun valore di default trovato per questo prompt.', 'error');
                else alert('Nessun valore di default trovato.');
            }
        } else {
            throw new Error("Impossibile caricare prompts_default.json");
        }
    } catch (err) {
        console.error("Errore ripristino prompt:", err);
        if (window.showToast) window.showToast('Errore durante il ripristino: ' + err.message, 'error');
        else alert('Errore ripristino: ' + err.message);
    }
};

window.resetAllPrompts = async function() {
    const confirmMsg = window.getAdminTranslation('admin_confirm_reset_all_prompts') || 'Sei sicuro di voler ripristinare TUTTI i prompt ai valori di default?';
    if (!confirm(confirmMsg)) return;
    
    try {
        // Inviamo un oggetto vuoto per resettare le sovrascritture utente
        if (window.electronAPI && window.electronAPI.savePrompts) {
            await window.electronAPI.savePrompts({});
        } else if (window.storageAdapter && window.storageAdapter.savePrompts) {
            await window.storageAdapter.savePrompts({});
        } else {
            localStorage.setItem("mappai_custom_prompts", "{}");
        }
        
        // Ricarichiamo la configurazione originale pulita
        await window.loadPromptsConfig();
        
        // Se un prompt era selezionato, aggiorniamo l'editor
        if (window.currentAdminPromptKey) {
            document.getElementById('admin-prompt-editor').value = window.systemPromptsConfig[window.currentAdminPromptKey] || '';
        }
        
        await window.renderAdminPromptsList();
        
        if (window.showToast) window.showToast('Tutti i prompt sono stati ripristinati ai valori di default!', 'success');
        else alert('Tutti i prompt sono stati ripristinati ai valori di default!');
    } catch (err) {
        console.error("Errore ripristino totale prompt:", err);
        if (window.showToast) window.showToast('Errore durante il ripristino totale: ' + err.message, 'error');
        else alert('Errore ripristino totale: ' + err.message);
    }
};

// Initial load at startup
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.loadPromptsConfig();
    });
} else {
    window.loadPromptsConfig();
}
