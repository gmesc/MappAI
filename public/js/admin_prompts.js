window.systemPromptsConfig = {};
window.systemPromptsDescriptions = {
    "L1_MACRO_CATEGORIES": "Generazione Nodi di Livello 1 (Macro-Categorie)",
    "MIND_MAP_BRANCH": "Costruzione strutturata dei Rami della Mappa Mentale",
    "KNOWLEDGE_GRAPH_SINGLE": "Generazione Knowledge Graph (Single Pass)",
    "SEMANTIC_CORRELATION": "Correlazione Semantica tra Mappe (Merge)",
    "MULTIPLE_CHOICE_QUIZ": "Generazione Quiz Multipli (Flashcards)",
    "SINGLE_QUIZ_TUTOR": "Generazione Quiz Singolo (AI Tutor)",
    "SOCRATIC_TUTOR_IT": "Istruzioni AI Tutor Socratico (Italiano)",
    "SOCRATIC_TUTOR_EN": "Istruzioni AI Tutor Socratico (Inglese)",
    "SOTA_SECOND_BRAIN": "Espansione Contesto SOTA Second Brain"
};
window.currentAdminPromptKey = null;

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
    
    window.renderAdminPromptsList();
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

window.renderAdminPromptsList = function() {
    const listEl = document.getElementById('admin-prompts-list');
    listEl.innerHTML = '';
    
    for (const key of Object.keys(window.systemPromptsConfig)) {
        const btn = document.createElement('button');
        btn.className = `w-full text-left p-3 rounded-lg border border-slate-200 transition-colors text-sm hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-2 ${window.currentAdminPromptKey === key ? 'bg-indigo-50 border-indigo-300' : 'bg-slate-50'}`;
        
        btn.innerHTML = `
            <div class="font-bold text-slate-800">${key}</div>
            <div class="text-[10px] text-slate-500 line-clamp-1">${window.systemPromptsDescriptions[key] || 'Nessuna descrizione'}</div>
        `;
        
        btn.onclick = () => window.selectAdminPrompt(key);
        listEl.appendChild(btn);
    }
};

window.selectAdminPrompt = function(key) {
    window.currentAdminPromptKey = key;
    document.getElementById('admin-prompt-title').innerText = key;
    document.getElementById('admin-prompt-desc').innerText = window.systemPromptsDescriptions[key] || 'Nessuna descrizione';
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
document.addEventListener('DOMContentLoaded', () => {
    window.loadPromptsConfig();
});
