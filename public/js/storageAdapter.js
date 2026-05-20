/**
 * MappAI - Storage & System Adapter (Polyfill per iPadOS e Browser Web)
 * * Questo file intercetta le chiamate a window.electronAPI quando l'app non è in esecuzione
 * all'interno di Electron (ad esempio su iPadOS via Capacitor o in un comune browser).
 * In questo modo il codice esistente in app.js e admin_prompts.js continua a funzionare
 * senza subire alcuna modifica!
 */

(function () {
    const isElectron = typeof window !== 'undefined' && window.process && window.process.type === 'renderer';

    if (isElectron) {
        console.log("[MappAI Adapter] Rilevato ambiente Electron nativo. Utilizzo IPC standard.");
        return; // Non sovrascrivere l'API nativa se siamo su Electron desktop
    }

    console.log("[MappAI Adapter] Ambiente non-Electron rilevato. Attivazione controfigura (Polyfill)...");

    // Rilevamento Capacitor (iPad/iOS)
    const isCapacitor = typeof window !== 'undefined' && window.Capacitor !== undefined;

    if (isCapacitor && window.Capacitor.Plugins) {
        if (!window.Capacitor.Plugins.Directory) {
            window.Capacitor.Plugins.Directory = {
                Documents: 'DOCUMENTS',
                Data: 'DATA',
                Cache: 'CACHE',
                External: 'EXTERNAL',
                ExternalStorage: 'EXTERNAL_STORAGE'
            };
        }
    }

    // Helper minimale per IndexedDB (per memorizzare dati pesanti nel browser senza limiti di localStorage)
    const dbName = "MappAI_LocalDatabase";
    const storeName = "vaultStore";

    function initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName);
                }
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async function getLocalItem(key) {
        const db = await initIndexedDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, "readonly");
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function setLocalItem(key, value) {
        const db = await initIndexedDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, "readwrite");
            const store = transaction.objectStore(storeName);
            const request = store.put(value, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Struttura fittizia del File System per simulare i Vault nel Browser Web
    let virtualVaults = [];
    let currentVirtualVault = null;

    // Funzione per caricare dinamicamente Mammoth.js per il parsing dei file Word (.docx) su iPad/Web
    function loadMammothLibrary() {
        return new Promise((resolve) => {
            if (typeof mammoth !== 'undefined') {
                resolve(mammoth);
                return;
            }
            const script = document.createElement('script');
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
            script.onload = () => {
                console.log("[MappAI Adapter] Mammoth.js caricato con successo lato client.");
                resolve(mammoth);
            };
            script.onerror = () => {
                console.error("[MappAI Adapter] Errore nel caricamento di Mammoth.js.");
                resolve(null);
            };
            document.head.appendChild(script);
        });
    }

    function loadHtml2Canvas() {
        return new Promise((resolve) => {
            if (typeof html2canvas !== 'undefined') {
                resolve(html2canvas);
                return;
            }
            const script = document.createElement('script');
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
            script.onload = () => {
                console.log("[MappAI Adapter] html2canvas.js caricato con successo.");
                resolve(html2canvas);
            };
            script.onerror = () => {
                console.error("[MappAI Adapter] Errore nel caricamento di html2canvas.js.");
                resolve(null);
            };
            document.head.appendChild(script);
        });
    }

    function getSvgFallback() {
        try {
            const svgElement = document.querySelector("#d3-container svg");
            if (!svgElement) return null;
            
            const clonedSvg = svgElement.cloneNode(true);
            const style = document.createElement("style");
            style.textContent = `
                svg { background-color: #0f172a; }
                .node-circle { fill: #1e293b; stroke: #38bdf8; stroke-width: 2px; }
                .node-text { fill: #f1f5f9; font-family: sans-serif; font-size: 12px; }
                .link { stroke: #475569; stroke-opacity: 0.6; stroke-width: 1.5px; }
                .link-label { fill: #94a3b8; font-family: sans-serif; font-size: 9px; }
            `;
            clonedSvg.insertBefore(style, clonedSvg.firstChild);
            
            const svgString = new XMLSerializer().serializeToString(clonedSvg);
            const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
            return URL.createObjectURL(svgBlob);
        } catch (err) {
            console.error("[MappAI Adapter] Errore fallback SVG:", err);
            return null;
        }
    }

    // Creazione dell'oggetto fittizio window.electronAPI
    window.electronAPI = {
        // --- STORAGE & GESTIONE VAULT ---

        getAllVaults: async function () {
            if (isCapacitor) {
                try {
                    const { Filesystem, Directory } = window.Capacitor.Plugins;
                    // Su iPad leggiamo l'indice dei vault salvato in un file di configurazione
                    const result = await Filesystem.readFile({
                        path: 'MappAI_Vaults/vaults_index.json',
                        directory: Directory.Documents,
                        encoding: 'utf8'
                    });
                    return JSON.parse(result.data);
                } catch (e) {
                    // Se il file indice non esiste, restituiamo un array vuoto
                    return [];
                }
            } else {
                // Su Web usiamo IndexedDB o localStorage
                const saved = await getLocalItem("mappai_vaults_list");
                return saved ? JSON.parse(saved) : [];
            }
        },

        loadVault: async function (folderPath) {
            currentVirtualVault = folderPath;
            if (isCapacitor) {
                try {
                    const { Filesystem, Directory } = window.Capacitor.Plugins;
                    const path = `MappAI_Vaults/${folderPath}/vault_data.json`;
                    const result = await Filesystem.readFile({
                        path: path,
                        directory: Directory.Documents,
                        encoding: 'utf8'
                    });
                    return JSON.parse(result.data);
                } catch (e) {
                    console.warn("[MappAI Adapter] Errore caricamento vault nativo, inizializzo vuoto:", e);
                    return { nodes: [], links: [], sourcesDict: {}, customColors: {} };
                }
            } else {
                // Su Web leggiamo da IndexedDB
                const data = await getLocalItem(`vault_content_${folderPath}`);
                return data ? JSON.parse(data) : { nodes: [], links: [], sourcesDict: {}, customColors: {} };
            }
        },

        saveVault: async function (vaultData) {
            const isExplicitExport = !!(vaultData && vaultData.mapData);
            const folderName = isExplicitExport ? vaultData.folderPath : null;
            const activeVault = folderName || currentVirtualVault || "Default_Vault";
            currentVirtualVault = activeVault;

            const mapData = isExplicitExport ? vaultData.mapData : vaultData;

            if (isCapacitor) {
                const { Filesystem, Directory } = window.Capacitor.Plugins;
                
                // 1. Salva il file monolitico vault_data.json per caricamento rapido dell'app
                const path = `MappAI_Vaults/${activeVault}/vault_data.json`;
                await Filesystem.writeFile({
                    path: path,
                    data: JSON.stringify(vaultData),
                    directory: Directory.Documents,
                    encoding: 'utf8',
                    recursive: true
                });

                // 2. Salva index.yaml (Configurazione Globale Mappa)
                const indexData = {
                    extractionMode: mapData.extractionMode,
                    rootNodeLabel: mapData.rootNodeLabel,
                    userProfile: mapData.userProfile,
                    customColors: mapData.customColors || {},
                    lastUpdated: new Date().toISOString()
                };
                const indexYaml = Object.entries(indexData).map(([k,v]) => {
                    if (typeof v === 'object' && v !== null) return `${k}: ${JSON.stringify(v)}`;
                    return `${k}: ${v}`;
                }).join('\n');
                await Filesystem.writeFile({
                    path: `MappAI_Vaults/${activeVault}/index.yaml`,
                    data: indexYaml,
                    directory: Directory.Documents,
                    encoding: 'utf8',
                    recursive: true
                });

                // 3. Salva Links (Relazioni)
                const linksData = (mapData.links || []).map(l => ({
                    source: typeof l.source === 'object' ? l.source.id : l.source,
                    target: typeof l.target === 'object' ? l.target.id : l.target,
                    rel: l.rel || "",
                    isCross: !!l.isCross
                }));
                await Filesystem.writeFile({
                    path: `MappAI_Vaults/${activeVault}/links.json`,
                    data: JSON.stringify(linksData, null, 2),
                    directory: Directory.Documents,
                    encoding: 'utf8',
                    recursive: true
                });

                // 4. Salva ciascun Nodo come file Markdown (.md) Obsidian-compatibile
                if (mapData.nodes && mapData.nodes.length) {
                    for (const node of mapData.nodes) {
                        const safeLabel = node.label.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                        const fileName = `${safeLabel}_${node.id}.md`;
                        
                        let frontmatter = '---\n';
                        frontmatter += `id: "${node.id}"\n`;
                        frontmatter += `label: "${node.label}"\n`;
                        frontmatter += `level: ${node.level}\n`;
                        frontmatter += `group: ${node.group || 0}\n`;
                        if (node.parent) frontmatter += `parent: "${node.parent}"\n`;
                        if (node.iconVisibility) frontmatter += `iconVisibility: ${JSON.stringify(node.iconVisibility)}\n`;
                        if (node.hasCustomText) frontmatter += `hasCustomText: true\n`;
                        if (node.hasCustomImage) frontmatter += `hasCustomImage: true\n`;
                        if (node.x !== undefined) frontmatter += `x: ${node.x}\n`;
                        if (node.y !== undefined) frontmatter += `y: ${node.y}\n`;
                        if (node.savedX !== undefined) frontmatter += `savedX: ${node.savedX}\n`;
                        if (node.savedY !== undefined) frontmatter += `savedY: ${node.savedY}\n`;
                        
                        if (node.customColor) {
                            frontmatter += `customColor: "${node.customColor}"\n`;
                        }
                        if (node.studyStatus) {
                            frontmatter += `studyStatus: "${node.studyStatus}"\n`;
                        }
                        
                        frontmatter += '---\n\n';
                        const content = node.content || "";

                        await Filesystem.writeFile({
                            path: `MappAI_Vaults/${activeVault}/Nodi/${fileName}`,
                            data: frontmatter + content,
                            directory: Directory.Documents,
                            encoding: 'utf8',
                            recursive: true
                        });
                    }
                }

                // Aggiorna anche l'indice dei vault
                let list = [];
                try {
                    const idxFile = await Filesystem.readFile({
                        path: 'MappAI_Vaults/vaults_index.json',
                        directory: Directory.Documents,
                        encoding: 'utf8'
                    });
                    list = JSON.parse(idxFile.data);
                } catch (e) { }

                if (!list.includes(activeVault)) {
                    list.push(activeVault);
                    await Filesystem.writeFile({
                        path: 'MappAI_Vaults/vaults_index.json',
                        data: JSON.stringify(list),
                        directory: Directory.Documents,
                        encoding: 'utf8',
                        recursive: true
                    });
                }

                // Se l'utente ha esplicitamente richiesto di salvare/esportare il vault, apri lo Share Sheet nativo di iOS
                if (isExplicitExport) {
                    try {
                        const blob = new Blob([JSON.stringify(vaultData, null, 2)], { type: 'application/json' });
                        const file = new File([blob], `${activeVault}_vault.json`, { type: 'application/json' });
                        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                            await navigator.share({
                                files: [file],
                                title: `Esporta Vault - ${activeVault}`,
                                text: `Vault di MappAI: ${activeVault}`
                            });
                        }
                    } catch (shareError) {
                        console.error("[MappAI Adapter] Errore durante navigator.share:", shareError);
                    }
                }

                return { success: true };
            } else {
                // Su Web scriviamo su IndexedDB
                await setLocalItem(`vault_content_${activeVault}`, JSON.stringify(vaultData));

                let list = await getLocalItem("mappai_vaults_list");
                let listArr = list ? JSON.parse(list) : [];
                if (!listArr.includes(activeVault)) {
                    listArr.push(activeVault);
                    await setLocalItem("mappai_vaults_list", JSON.stringify(listArr));
                }
                return { success: true };
            }
        },

        saveMapJSON: async function (appState) {
            // MappAI usa questo metodo per un salvataggio rapido dello stato attuale del grafico
            return this.saveVault(appState.db);
        },

        saveChatTranscript: async function (transcriptData) {
            const activeVault = currentVirtualVault || "Default_Vault";
            const filename = `chat_${Date.now()}.json`;

            if (isCapacitor) {
                const { Filesystem, Directory } = window.Capacitor.Plugins;
                await Filesystem.writeFile({
                    path: `MappAI_Vaults/${activeVault}/chats/${filename}`,
                    data: JSON.stringify(transcriptData),
                    directory: Directory.Documents,
                    encoding: 'utf8',
                    recursive: true
                });
                return { success: true };
            } else {
                await setLocalItem(`vault_chat_${activeVault}_${filename}`, JSON.stringify(transcriptData));
                return { success: true };
            }
        },

        loadPrompts: async function () {
            // Carica la configurazione dei prompt personalizzati dell'utente
            const key = "mappai_custom_prompts";
            if (isCapacitor) {
                try {
                    const { Filesystem, Directory } = window.Capacitor.Plugins;
                    const res = await Filesystem.readFile({
                        path: 'MappAI_Config/prompts.json',
                        directory: Directory.Documents,
                        encoding: 'utf8'
                    });
                    return JSON.parse(res.data);
                } catch (e) {
                    return {};
                }
            } else {
                const data = localStorage.getItem(key);
                return data ? JSON.parse(data) : {};
            }
        },

        savePrompts: async function (config) {
            const key = "mappai_custom_prompts";
            if (isCapacitor) {
                const { Filesystem, Directory } = window.Capacitor.Plugins;
                await Filesystem.writeFile({
                    path: 'MappAI_Config/prompts.json',
                    data: JSON.stringify(config),
                    directory: Directory.Documents,
                    encoding: 'utf8',
                    recursive: true
                });
                return { success: true };
            } else {
                localStorage.setItem(key, JSON.stringify(config));
                return { success: true };
            }
        },

        // --- FILE SYSTEM, FILE PICKING & PARSING ---

        pickFolder: async function () {
            // Su iPad/Web non possiamo selezionare cartelle reali di sistema.
            // Creiamo un prompt o usiamo un nome fisso per simulare il selettore.
            const vaultName = prompt("Inserisci il nome del nuovo Vault (o seleziona un nome esistente):", "Nuovo_Vault");
            if (!vaultName) return { canceled: true };

            currentVirtualVault = vaultName.replace(/[^a-zA-Z0-9_]/g, "_"); // Rimuoviamo caratteri non sicuri
            return { canceled: false, folderPath: currentVirtualVault };
        },

        pickFile: async function () {
            // Simula la selezione di un singolo file tramite un input file HTML nascosto
            return new Promise((resolve) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        // Creiamo un oggetto compatibile per il resto dell'applicazione
                        resolve({
                            name: file.name,
                            path: file.name, // Sostituto del path assoluto non disponibile su browser
                            rawFile: file     // Conserviamo il riferimento al file binario per leggerlo in seguito
                        });
                    } else {
                        resolve(null);
                    }
                };
                input.click();
            });
        },

        getPathForFile: function (file) {
            // Restituisce un identificativo del file o il suo nome
            return file ? (file.path || file.name) : '';
        },

        openSaveFolder: function () {
            // Su mobile non possiamo aprire direttamente l'app File su una cartella specifica.
            // Mostriamo una notifica amichevole per informare l'utente.
            if (typeof window.showAlert === 'function') {
                window.showAlert("Info", "I tuoi dati sono salvati in sicurezza all'interno dei documenti di MappAI sull'iPad.");
            } else {
                alert("I tuoi dati sono salvati in sicurezza all'interno dei documenti di MappAI.");
            }
        },

        parseDocx: async function (fileObjectOrPath) {
            // Estrae il testo da un file .docx utilizzando mammoth.js caricato in tempo reale
            const mammothInstance = await loadMammothLibrary();
            if (!mammothInstance) {
                throw new Error("Impossibile caricare il convertitore Word (Mammoth.js) lato client.");
            }

            let fileData;
            if (fileObjectOrPath && fileObjectOrPath.rawFile) {
                // Se abbiamo l'oggetto File HTML5 nativo
                fileData = await fileObjectOrPath.rawFile.arrayBuffer();
            } else {
                throw new Error("Nessun file selezionato per l'analisi .docx su questa piattaforma.");
            }

            const result = await mammothInstance.extractRawText({ arrayBuffer: fileData });
            return result.value; // Restituisce il testo estratto puro
        },

        // --- RETE & AI (Bypass CORS) ---

        listInfomaniakModels: async function (options) {
            const { apiKey, productId } = options || {};
            const token = apiKey || localStorage.getItem('infomaniak_api_key') || '';
            const prodId = productId || localStorage.getItem('infomaniak_product_id') || '';
            const url = `https://api.infomaniak.com/2/ai/${prodId}/openai/v1/models`;

            if (isCapacitor && window.Capacitor.Plugins.CapacitorHttp) {
                try {
                    const { CapacitorHttp } = window.Capacitor.Plugins;
                    const response = await CapacitorHttp.request({
                        method: 'GET',
                        url: url,
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const parsed = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
                    const models = (parsed.data || []).map(m => ({
                        id: m.id,
                        displayName: m.id + ' (Swiss AI)',
                        kb: { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], free: false, inputCost: 0, outputCost: 0, note: 'Infomaniak Cloud' }
                    }));
                    return models;
                } catch (e) {
                    console.error("Errore nativo fetch modelli Infomaniak:", e);
                    return { error: e.message };
                }
            }
            try {
                const response = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const parsed = await response.json();
                const models = (parsed.data || []).map(m => ({
                    id: m.id,
                    displayName: m.id + ' (Swiss AI)',
                    kb: { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], free: false, inputCost: 0, outputCost: 0, note: 'Infomaniak Cloud' }
                }));
                return models;
            } catch (e) {
                console.error("Errore fetch modelli Infomaniak:", e);
                return { error: e.message };
            }
        },

        listModels: async function (options) {
            const apiKey = (options && options.apiKey) || (window.getSystemKey ? window.getSystemKey() : localStorage.getItem('gemini_api_key'));
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            
            const parseGeminiModels = (data) => {
                if (!data || !data.models) return [];
                return data.models
                    .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                    .map(m => ({
                        id: m.name.replace('models/', ''),
                        displayName: m.displayName || m.name.replace('models/', ''),
                        description: m.description || ''
                    }));
            };

            if (isCapacitor && window.Capacitor.Plugins.CapacitorHttp) {
                try {
                    const { CapacitorHttp } = window.Capacitor.Plugins;
                    const response = await CapacitorHttp.request({
                        method: 'GET',
                        url: url
                    });
                    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
                    return parseGeminiModels(data);
                } catch (e) {
                    console.error("Errore nativo fetch modelli Gemini:", e);
                    return [];
                }
            }
            try {
                const response = await fetch(url);
                const data = await response.json();
                return parseGeminiModels(data);
            } catch (e) {
                console.error("Errore fetch modelli Gemini:", e);
                return [];
            }
        },

        generateInfomaniak: async function (options) {
            const { apiKey, payload, productId } = options || {};
            const token = apiKey || localStorage.getItem('infomaniak_api_key') || '';
            const prodId = productId || localStorage.getItem('infomaniak_product_id') || '';
            const url = `https://api.infomaniak.com/2/ai/${prodId}/openai/v1/chat/completions`;

            // Se siamo su Capacitor, usiamo il plugin Http nativo per bypassare interamente i controlli CORS
            if (isCapacitor && window.Capacitor.Plugins.CapacitorHttp) {
                const { CapacitorHttp } = window.Capacitor.Plugins;
                const response = await CapacitorHttp.request({
                    method: 'POST',
                    url: url,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    data: payload
                });
                return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
            }

            // Fallback per Browser standard
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            return await res.json();
        },

        generateGemini: async function (payload) {
            const apiKey = window.getSystemKey ? window.getSystemKey() : localStorage.getItem('gemini_api_key');
            // Nota: MappAI usa il modello di default configurato. Sostituiamo dinamicamente se necessario.
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

            if (isCapacitor && window.Capacitor.Plugins.CapacitorHttp) {
                const { CapacitorHttp } = window.Capacitor.Plugins;
                const response = await CapacitorHttp.request({
                    method: 'POST',
                    url: url,
                    headers: { 'Content-Type': 'application/json' },
                    data: payload
                });
                return response.data;
            }

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            return await res.json();
        },

        fetchUrl: async function (targetUrl) {
            // Utilizzato per fare scraping o recuperare contenuti web esterni
            if (isCapacitor && window.Capacitor.Plugins.CapacitorHttp) {
                const { CapacitorHttp } = window.Capacitor.Plugins;
                const response = await CapacitorHttp.request({
                    method: 'GET',
                    url: targetUrl
                });
                return response.data;
            }

            const res = await fetch(targetUrl);
            return await res.text();
        },

        uploadFileGemini: async function (fileObject) {
            // Gestione upload per l'analisi multimediale di Gemini
            throw new Error("L'upload diretto di file complessi via API non è supportato in modalità client isolata su iPad/Web. Converti in formato testuale o immagine Base64.");
        },

        // --- UTILITY DI SISTEMA ---

        getMachineId: async function () {
            // Genera un ID macchina persistente univoco per la gestione del profilo utente
            const key = "mappai_machine_id_emulated";
            let id = localStorage.getItem(key);
            if (!id) {
                id = 'ipad-emulated-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                localStorage.setItem(key, id);
            }
            return id;
        },

        openExternal: async function (url) {
            if (isCapacitor) {
                // Su iPad apriamo l'URL nel browser esterno o nella WebView di sistema
                window.open(url, '_system');
            } else {
                window.open(url, '_blank');
            }
        },

        capturePage: async function () {
            try {
                const h2c = await loadHtml2Canvas();
                if (!h2c) throw new Error("html2canvas non caricato");

                const target = document.getElementById("d3-container") || document.body;
                
                // Rendi temporaneamente trasparente il contenitore per escludere lo sfondo e la griglia
                target.style.setProperty('background-color', 'transparent', 'important');
                target.style.setProperty('background-image', 'none', 'important');

                // Opzioni ottimizzate per iPad/Safari con sfondo trasparente
                const canvas = await h2c(target, {
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: null, // Consente la trasparenza impostata sull'elemento
                    scale: 2, // Snapshot HD (doppia risoluzione)
                    logging: false
                });

                // Ripristina lo sfondo e la griglia originali
                target.style.removeProperty('background-color');
                target.style.removeProperty('background-image');

                return canvas.toDataURL("image/png");
            } catch (e) {
                // In caso di errore ripristina comunque
                const target = document.getElementById("d3-container");
                if (target) {
                    target.style.removeProperty('background-color');
                    target.style.removeProperty('background-image');
                }
                console.warn("[MappAI Adapter] Errore html2canvas, uso fallback SVG:", e);
                return getSvgFallback();
            }
        }
    };

    // Disabilita lo zoom pinch nativo a livello di viewport su Safari/iPadOS
    document.addEventListener('gesturestart', function (e) {
        e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturechange', function (e) {
        e.preventDefault();
    }, { passive: false });

    console.log("[MappAI Adapter] Polyfill installato correttamente con successo!");
})();
