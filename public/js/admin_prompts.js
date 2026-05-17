window.systemPromptsConfig = {};
window.systemPromptsDescriptions = {
    "L1_MACRO_CATEGORIES": "admin_prompt_desc_l1",
    "MIND_MAP_FULL_TREE": "admin_prompt_desc_mm_full",
    "KNOWLEDGE_GRAPH_FULL_TREE": "admin_prompt_desc_kg_full",
    "MIND_MAP_BRANCH": "admin_prompt_desc_branch",
    "KNOWLEDGE_GRAPH_SINGLE": "admin_prompt_desc_kg",
    "SEMANTIC_CORRELATION": "admin_prompt_desc_merge",
    "MULTIPLE_CHOICE_QUIZ": "admin_prompt_desc_quiz_flash",
    "SINGLE_QUIZ_TUTOR": "admin_prompt_desc_quiz_tutor",
    "SOCRATIC_TUTOR_IT": "admin_prompt_desc_socratic_it",
    "SOCRATIC_TUTOR_EN": "admin_prompt_desc_socratic_en",
    "SOCRATIC_TUTOR": "admin_prompt_desc_socratic_it",
    "SOTA_SECOND_BRAIN": "admin_prompt_desc_sota",
    "DYNAMIC_QUIZ": "admin_prompt_desc_dynamic_quiz",
    "FLASHCARD_GENERATOR": "admin_prompt_desc_flashcards",
    "MIND_MAP_FULL_TREE_IT": "admin_prompt_desc_mm_full",
    "MIND_MAP_FULL_TREE_EN": "admin_prompt_desc_mm_full",
    "KNOWLEDGE_GRAPH_FULL_TREE_IT": "admin_prompt_desc_kg_full",
    "KNOWLEDGE_GRAPH_FULL_TREE_EN": "admin_prompt_desc_kg_full"
};

window.systemPromptsCategories = {
    "MINDMAPS": ["L1_MACRO_CATEGORIES", "MIND_MAP_FULL_TREE", "MIND_MAP_BRANCH"],
    "KGRAPHS": ["KNOWLEDGE_GRAPH_FULL_TREE", "KNOWLEDGE_GRAPH_SINGLE", "SEMANTIC_CORRELATION", "SOTA_SECOND_BRAIN"],
    "TUTOR": ["SINGLE_QUIZ_TUTOR", "SOCRATIC_TUTOR"],
    "STUDY": ["MULTIPLE_CHOICE_QUIZ", "DYNAMIC_QUIZ", "FLASHCARD_GENERATOR"]
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
    "STUDY": "admin_explanation_study"
};

window.currentAdminPromptKey = null;
window.currentAdminTab = "MINDMAPS";

// Helper function to fill variables in prompt string
window.fillPromptTemplate = function(promptKey, variables) {
    // Prova a cercare il prompt con il suffisso della lingua corrente (es. _IT o _EN)
    const langSuffix = (window.currentLanguage === 'en' || window.currentLanguage === 'en-US') ? '_EN' : '_IT';
    
    let text = "";
    // Seleziona preferenzialmente i prompt specifici per Infomaniak se il provider è attivo
    if (window.appState && window.appState.aiProvider === 'infomaniak') {
        text = window.systemPromptsConfig[promptKey + "_INFOMANIAK" + langSuffix] || window.systemPromptsConfig[promptKey + "_INFOMANIAK"] || "";
    }
    
    if (!text) {
        text = window.systemPromptsConfig[promptKey + langSuffix] || window.systemPromptsConfig[promptKey] || "";
    }
    
    for (const [key, value] of Object.entries(variables || {})) {
        text = text.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return text;
};

// Keyboard listener for CTRL+SHIFT+P+O+I+U
const pressedKeys = new Set();
document.addEventListener('keydown', (e) => {
    pressedKeys.add(e.key.toUpperCase());
    
    // Check if ctrl, shift, P, O, I, U are all pressed
    const hasCtrl = e.ctrlKey || e.metaKey;
    const hasShift = e.shiftKey;
    const hasP = pressedKeys.has('P');
    const hasO = pressedKeys.has('O');
    const hasI = pressedKeys.has('I');
    const hasU = pressedKeys.has('U');
    
    if (hasCtrl && hasShift && hasP && hasO && hasI && hasU) {
        window.openAdminDashboard();
        // Prevent default browser behavior
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    pressedKeys.delete(e.key.toUpperCase());
});

window.openAdminDashboard = async function() {
    document.getElementById('admin-dashboard').classList.remove('hidden');
    document.getElementById('admin-dashboard').classList.add('flex');
    
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
            <div class="font-bold text-slate-800 text-[11px]">${key}</div>
            <div class="text-[10px] text-slate-500 line-clamp-1">${descText}</div>
        `;
        
        btn.onclick = () => window.selectAdminPrompt(key);
        listEl.appendChild(btn);
    }

    if (!foundAny) {
        listEl.innerHTML = '<div class="text-center p-10 text-slate-400 text-xs italic">Nessun prompt trovato in questa categoria.</div>';
    }
};

window.switchAdminTab = function(tab) {
    window.currentAdminTab = tab;
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

// Initial load at startup
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.loadPromptsConfig();
    });
} else {
    window.loadPromptsConfig();
}
