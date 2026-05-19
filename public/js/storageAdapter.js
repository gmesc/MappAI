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
            // Se non c'è un vault attivo, ne creiamo uno temporaneo di default
            const activeVault = currentVirtualVault || "Default_Vault";

            if (isCapacitor) {
                const { Filesystem, Directory } = window.Capacitor.Plugins;
                const path = `MappAI_Vaults/${activeVault}/vault_data.json`;
                await Filesystem.writeFile({
                    path: path,
                    data: JSON.stringify(vaultData),
                    directory: Directory.Documents,
                    encoding: 'utf8',
                    recursive: true
                });

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
            if (!vaultName) return null;

            currentVirtualVault = vaultName.replace(/[^a-zA-Z0-9_]/g, "_"); // Rimuoviamo caratteri non sicuri
            return currentVirtualVault;
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

        listModels: async function () {
            const apiKey = window.getSystemKey ? window.getSystemKey() : localStorage.getItem('gemini_api_key');
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            if (isCapacitor && window.Capacitor.Plugins.CapacitorHttp) {
                try {
                    const { CapacitorHttp } = window.Capacitor.Plugins;
                    const response = await CapacitorHttp.request({
                        method: 'GET',
                        url: url
                    });
                    return response.data;
                } catch (e) {
                    console.error("Errore nativo fetch modelli Gemini:", e);
                    return { error: e.message };
                }
            }
            try {
                const response = await fetch(url);
                return await response.json();
            } catch (e) {
                console.error("Errore fetch modelli Gemini:", e);
                return { error: e.message };
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
            // Electron cattura la finestra con API native. 
            // Su iPad/Web, l'agente dovrà caricare html2canvas per fotografare l'elemento #main-content o l'SVG del grafo.
            console.warn("[MappAI Adapter] capturePage emulato: scarica l'immagine SVG del grafo direttamente tramite i controlli dell'interfaccia utente.");
            return null;
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
