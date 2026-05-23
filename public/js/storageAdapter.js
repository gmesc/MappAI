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

    // In-memory cache for credentials to allow synchronous reads via window.getSystemKey()
    window.secureKeys = {
        gemini_api_key: '',
        infomaniak_api_key: ''
    };

    window.initSecureKeys = async function () {
        if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.KeychainPlugin) {
            try {
                const { KeychainPlugin } = window.Capacitor.Plugins;
                const geminiRes = await KeychainPlugin.getSecret({ key: 'gemini_api_key' });
                window.secureKeys['gemini_api_key'] = geminiRes.value || '';
                
                const infoRes = await KeychainPlugin.getSecret({ key: 'infomaniak_api_key' });
                window.secureKeys['infomaniak_api_key'] = infoRes.value || '';
                
                console.log("[MappAI Adapter] Keychain keys initialized successfully.");
            } catch (e) {
                console.error("[MappAI Adapter] Error loading secrets from iOS Keychain:", e);
            }
        } else {
            // Load from localStorage for compatibility when running in web / non-iOS environment
            window.secureKeys['gemini_api_key'] = localStorage.getItem('gemini_api_key') || '';
            window.secureKeys['infomaniak_api_key'] = localStorage.getItem('infomaniak_api_key') || '';
        }
    };

    window.saveSecureKey = async function (key, value) {
        window.secureKeys[key] = value;
        if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.KeychainPlugin) {
            try {
                const { KeychainPlugin } = window.Capacitor.Plugins;
                if (value === "") {
                    await KeychainPlugin.deleteSecret({ key });
                } else {
                    await KeychainPlugin.setSecret({ key, value });
                }
            } catch (e) {
                console.error(`[MappAI Adapter] Error writing key '${key}' to iOS Keychain:`, e);
            }
        } else {
            localStorage.setItem(key, value);
        }
    };

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

    async function scanVaultsRecursive(currentPath, depth = 0) {
        if (depth > 2) return [];
        const { Filesystem, Directory } = window.Capacitor.Plugins;
        let vaults = [];
        try {
            const readResult = await Filesystem.readdir({
                path: currentPath,
                directory: Directory.Documents
            });
            for (const file of readResult.files) {
                const name = typeof file === 'string' ? file : file.name;
                if (name.startsWith('.')) continue;
                const fullPath = `${currentPath}/${name}`;
                let isVault = false;
                let vaultInfo = null;
                try {
                    const indexFile = await Filesystem.readFile({
                        path: `${fullPath}/index.yaml`,
                        directory: Directory.Documents,
                        encoding: 'utf8'
                    });
                    isVault = true;
                    vaultInfo = {
                        folderName: name,
                        fullPath: fullPath.replace('MappAI - Vault/', '')
                    };
                    indexFile.data.split('\n').forEach(line => {
                        if (line.startsWith('extractionMode:')) vaultInfo.extractionMode = line.split(':')[1].trim();
                        if (line.startsWith('rootNodeLabel:')) vaultInfo.rootNodeLabel = line.substring(line.indexOf(':') + 1).trim();
                        if (line.startsWith('lastUpdated:')) vaultInfo.lastUpdated = line.split('lastUpdated:')[1].trim();
                        if (line.startsWith('userProfile:')) {
                            try {
                                const profile = JSON.parse(line.substring(line.indexOf(':') + 1).trim());
                                vaultInfo.nickname = profile.nickname;
                                vaultInfo.age = profile.age;
                            } catch(e) {}
                        }
                    });
                } catch (e) {
                    try {
                        const dataFile = await Filesystem.readFile({
                            path: `${fullPath}/vault_data.json`,
                            directory: Directory.Documents,
                            encoding: 'utf8'
                        });
                        isVault = true;
                        const parsed = JSON.parse(dataFile.data);
                        const mapData = parsed.db ? parsed.db : parsed;
                        vaultInfo = {
                            folderName: name,
                            fullPath: fullPath.replace('MappAI - Vault/', ''),
                            extractionMode: parsed.extractionMode || 'mindmap',
                            rootNodeLabel: parsed.rootNodeLabel || name,
                            lastUpdated: parsed.lastUpdated || new Date().toISOString()
                        };
                    } catch (err) {}
                }
                if (isVault && vaultInfo) {
                    vaults.push(vaultInfo);
                } else {
                    const fileType = typeof file === 'string' ? null : file.type;
                    if (fileType === 'directory' || fileType === null) {
                        const subVaults = await scanVaultsRecursive(fullPath, depth + 1);
                        vaults = vaults.concat(subVaults);
                    }
                }
            }
        } catch (err) {}
        return vaults;
    }

    // Creazione dell'oggetto fittizio window.electronAPI
    window.electronAPI = {
        // --- STORAGE & GESTIONE VAULT ---

        getAllVaults: async function () {
            if (isCapacitor) {
                return await scanVaultsRecursive('MappAI - Vault', 0);
            } else {
                // Su Web usiamo IndexedDB o localStorage
                const saved = await getLocalItem("mappai_vaults_list");
                return saved ? JSON.parse(saved) : [];
            }
        },

        loadVault: async function (folderPath) {
            currentVirtualVault = folderPath;
            if (isCapacitor) {
                const { Filesystem, Directory } = window.Capacitor.Plugins;
                const vaultRoot = `MappAI - Vault/${folderPath}`;
                
                try {
                    // Tenta prima di caricare il file monolitico vault_data.json (caricamento veloce)
                    const dataPath = `${vaultRoot}/vault_data.json`;
                    const result = await Filesystem.readFile({
                        path: dataPath,
                        directory: Directory.Documents,
                        encoding: 'utf8'
                    });
                    const parsed = JSON.parse(result.data);
                    let mapData = parsed;
                    if (parsed && parsed.mapData) {
                        mapData = parsed.mapData;
                    } else if (parsed && parsed.db) {
                        mapData = parsed.db;
                    }
                    return { success: true, data: mapData };
                } catch (e) {
                    console.log("[MappAI Adapter] vault_data.json assente o corrotto. Caricamento analitico della cartella...");
                    
                    // Se vault_data.json manca, facciamo il parsing manuale di index.yaml, links.json, Nodi/*.md
                    try {
                        const mapData = {
                            nodes: [],
                            links: [],
                            extractionMode: 'mindmap',
                            rootNodeLabel: folderPath,
                            customColors: {},
                            studySets: []
                        };

                        // 1. Carica index.yaml
                        try {
                            const indexFile = await Filesystem.readFile({
                                path: `${vaultRoot}/index.yaml`,
                                directory: Directory.Documents,
                                encoding: 'utf8'
                            });
                            indexFile.data.split('\n').forEach(line => {
                                if (line.startsWith('extractionMode:')) mapData.extractionMode = line.split(':')[1].trim();
                                if (line.startsWith('rootNodeLabel:')) mapData.rootNodeLabel = line.substring(line.indexOf(':') + 1).trim();
                                if (line.startsWith('userProfile:')) {
                                    try { mapData.userProfile = JSON.parse(line.substring(line.indexOf(':') + 1).trim()); } catch(err) {}
                                }
                                if (line.startsWith('customColors:')) {
                                    try { mapData.customColors = JSON.parse(line.substring(line.indexOf(':') + 1).trim()); } catch(err) {}
                                }
                                if (line.startsWith('generationUsage:')) {
                                    try { mapData.generationUsage = JSON.parse(line.substring(line.indexOf(':') + 1).trim()); } catch(err) {}
                                }
                            });
                        } catch (err) {
                            console.log("[MappAI Adapter] Nessun index.yaml trovato.");
                        }

                        // 2. Carica links.json
                        try {
                            const linksFile = await Filesystem.readFile({
                                path: `${vaultRoot}/links.json`,
                                directory: Directory.Documents,
                                encoding: 'utf8'
                            });
                            const rawLinks = JSON.parse(linksFile.data);
                            mapData.links = rawLinks.map(l => ({
                                source: l.source,
                                target: l.target,
                                rel: l.rel || "include",
                                isCross: !!l.isCross
                            }));
                        } catch (err) {
                            console.log("[MappAI Adapter] Nessun links.json trovato.");
                        }

                        // 3. Carica i nodi da Nodi/*.md
                        try {
                            const nodesRead = await Filesystem.readdir({
                                path: `${vaultRoot}/Nodi`,
                                directory: Directory.Documents
                            });
                            for (const file of nodesRead.files) {
                                const fileName = typeof file === 'string' ? file : file.name;
                                if (!fileName.endsWith('.md')) continue;

                                try {
                                    const nodeFile = await Filesystem.readFile({
                                        path: `${vaultRoot}/Nodi/${fileName}`,
                                        directory: Directory.Documents,
                                        encoding: 'utf8'
                                    });
                                    const parts = nodeFile.data.split('---');
                                    if (parts.length >= 3) {
                                        const fmLines = parts[1].trim().split('\n');
                                        const node = { chunks: [] };
                                        fmLines.forEach(l => {
                                            const colonIdx = l.indexOf(':');
                                            if (colonIdx === -1) return;
                                            const k = l.substring(0, colonIdx).trim();
                                            const v = l.substring(colonIdx + 1).trim();
                                            const cleanV = v.replace(/^"(.*)"$/, '$1');
                                            if (k === 'id') node.id = cleanV;
                                            if (k === 'label') node.label = cleanV;
                                            if (k === 'level') node.level = parseInt(cleanV);
                                            if (k === 'group') node.group = parseInt(cleanV);
                                            if (k === 'parent') node.parent = cleanV;
                                            if (k === 'images') {
                                                try { node.images = JSON.parse(v); } catch(err) {}
                                            }
                                            if (k === 'iconVisibility') {
                                                try { node.iconVisibility = JSON.parse(v); } catch(err) {}
                                            }
                                            if (k === 'hasCustomText') node.hasCustomText = (cleanV === 'true');
                                            if (k === 'hasCustomImage') node.hasCustomImage = (cleanV === 'true');
                                            if (k === 'x') { node.x = parseFloat(cleanV); node.fx = node.x; }
                                            if (k === 'y') { node.y = parseFloat(cleanV); node.fy = node.y; }
                                            if (k === 'savedX') node.savedX = parseFloat(cleanV);
                                            if (k === 'savedY') node.savedY = parseFloat(cleanV);
                                        });

                                        let body = parts.slice(2).join('---').trim();
                                        body = body.replace(/!\[\[.*?\]\]\n\n/g, '');
                                        
                                        const fontiPart = body.split('## Fonti');
                                        if (fontiPart.length > 1) {
                                            node.desc = fontiPart[0].replace(/^# .*\n\n/, '').trim();
                                            const fontiLines = fontiPart[1].trim().split('\n- ');
                                            fontiLines.forEach(f => {
                                                let cleanLine = f.replace(/^- /, '').trim();
                                                const matchWithSource = cleanLine.match(/\[(.*?) \| (.*?)\]: (.*)/);
                                                if (matchWithSource) {
                                                    node.chunks.push({ title: matchWithSource[1], source: matchWithSource[2], text: matchWithSource[3] });
                                                } else {
                                                    const matchSimple = cleanLine.match(/\[(.*?)\]: (.*)/);
                                                    if (matchSimple) {
                                                        node.chunks.push({ title: matchSimple[1], source: 'Originale', text: matchSimple[2] });
                                                    }
                                                }
                                            });
                                        } else {
                                            node.desc = body.replace(/^# .*\n\n/, '').trim();
                                        }
                                        mapData.nodes.push(node);
                                    }
                                } catch (nodeErr) {
                                    console.error(`[MappAI Adapter] Errore lettura nodo ${fileName}:`, nodeErr);
                                }
                            }
                        } catch (err) {
                            console.log("[MappAI Adapter] Nessuna cartella Nodi trovata o leggibile.");
                        }

                        // 4. Carica chat_state.json
                        try {
                            const chatStateFile = await Filesystem.readFile({
                                path: `${vaultRoot}/chat_state.json`,
                                directory: Directory.Documents,
                                encoding: 'utf8'
                            });
                            mapData.tutorState = JSON.parse(chatStateFile.data);
                        } catch (err) {}

                        // 5. Carica Materiale Studio
                        try {
                            const studyRead = await Filesystem.readdir({
                                path: `${vaultRoot}/Materiale Studio`,
                                directory: Directory.Documents
                            });
                            for (const file of studyRead.files) {
                                const fileName = typeof file === 'string' ? file : file.name;
                                if (!fileName.endsWith('.json')) continue;
                                try {
                                    const contentFile = await Filesystem.readFile({
                                        path: `${vaultRoot}/Materiale Studio/${fileName}`,
                                        directory: Directory.Documents,
                                        encoding: 'utf8'
                                    });
                                    const set = JSON.parse(contentFile.data);
                                    mapData.studySets.push(set);
                                } catch (err) {}
                            }
                        } catch (err) {}

                        return { success: true, data: mapData };
                    } catch (parseErr) {
                        console.error("[MappAI Adapter] Errore critico nel parsing analitico del vault nativo:", parseErr);
                        return { success: false, error: parseErr.message };
                    }
                }
            } else {
                // Su Web leggiamo da IndexedDB
                const data = await getLocalItem(`vault_content_${folderPath}`);
                const parsed = data ? JSON.parse(data) : null;
                let mapData = parsed || { nodes: [], links: [], sourcesDict: {}, customColors: {} };
                if (parsed && parsed.mapData) {
                    mapData = parsed.mapData;
                }
                return { success: true, data: mapData };
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
                const path = `MappAI - Vault/${activeVault}/vault_data.json`;
                await Filesystem.writeFile({
                    path: path,
                    data: JSON.stringify(mapData),
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
                    path: `MappAI - Vault/${activeVault}/index.yaml`,
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
                    path: `MappAI - Vault/${activeVault}/links.json`,
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
                            path: `MappAI - Vault/${activeVault}/Nodi/${fileName}`,
                            data: frontmatter + content,
                            directory: Directory.Documents,
                            encoding: 'utf8',
                            recursive: true
                        });
                    }
                }

                // 5. Salva Materiale Studio (Flashcards/Quiz)
                if (mapData.studySets && mapData.studySets.length) {
                    for (const set of mapData.studySets) {
                        const safeTitle = (set.title || "Studio").replace(/[^a-z0-9]/gi, '_').toLowerCase();
                        const fileName = `${safeTitle}_${set.id}.json`;
                        await Filesystem.writeFile({
                            path: `MappAI - Vault/${activeVault}/Materiale Studio/${fileName}`,
                            data: JSON.stringify(set, null, 2),
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
                        path: 'MappAI - Vault/vaults_index.json',
                        directory: Directory.Documents,
                        encoding: 'utf8'
                    });
                    list = JSON.parse(idxFile.data);
                } catch (e) { }

                if (!list.includes(activeVault)) {
                    list.push(activeVault);
                    await Filesystem.writeFile({
                        path: 'MappAI - Vault/vaults_index.json',
                        data: JSON.stringify(list),
                        directory: Directory.Documents,
                        encoding: 'utf8',
                        recursive: true
                    });
                }

                // Salvataggio completato localmente senza richiedere lo Share Sheet nativo per evitare ambiguità.
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
                    path: `MappAI - Vault/${activeVault}/chats/${filename}`,
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

        saveQuizTextResponse: async function (data) {
            const { title, textContent } = data;
            const activeVault = currentVirtualVault || "Default_Vault";
            const safeTitle = (title || "Quiz").replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const filename = `risposte_quiz_${safeTitle}_${Date.now()}.txt`;

            if (isCapacitor) {
                const { Filesystem, Directory } = window.Capacitor.Plugins;
                await Filesystem.writeFile({
                    path: `MappAI - Vault/${activeVault}/chats/${filename}`,
                    data: textContent,
                    directory: Directory.Documents,
                    encoding: 'utf8',
                    recursive: true
                });
                return { success: true };
            } else {
                await setLocalItem(`vault_quiz_txt_${activeVault}_${filename}`, textContent);
                return { success: true };
            }
        },

        loadPrompts: async function () {
            let defaultPrompts = {};
            try {
                const response = await fetch('./prompts_default.json');
                if (response.ok) {
                    defaultPrompts = await response.json();
                }
            } catch (err) {
                console.error("[MappAI Adapter] Errore caricamento prompts di default:", err);
            }

            let overrides = {};
            const key = "mappai_custom_prompts";
            if (isCapacitor) {
                try {
                    const { Filesystem, Directory } = window.Capacitor.Plugins;
                    const res = await Filesystem.readFile({
                        path: 'MappAI_Config/prompts_user.json',
                        directory: Directory.Documents,
                        encoding: 'utf8'
                    });
                    overrides = JSON.parse(res.data);
                } catch (e) {
                    // Ignora se non esistono personalizzazioni
                }
            } else {
                try {
                    const data = localStorage.getItem(key);
                    if (data) {
                        overrides = JSON.parse(data);
                    }
                } catch (e) {}
            }

            const combined = { ...defaultPrompts, ...overrides };
            return { success: true, data: combined };
        },

        savePrompts: async function (config) {
            const key = "mappai_custom_prompts";
            if (isCapacitor) {
                const { Filesystem, Directory } = window.Capacitor.Plugins;
                await Filesystem.writeFile({
                    path: 'MappAI_Config/prompts_user.json',
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
            if (isCapacitor) {
                return new Promise((resolve) => {
                    const choice = confirm("Vuoi importare un file di Vault (.json) esistente?\n\n(Seleziona 'Annulla' per creare un nuovo Vault vuoto)");
                    if (choice) {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.json';
                        input.onchange = async (e) => {
                            const file = e.target.files[0];
                            if (!file) {
                                resolve({ canceled: true });
                                return;
                            }
                            const reader = new FileReader();
                            reader.onload = async (evt) => {
                                try {
                                    const parsed = JSON.parse(evt.target.result);
                                    const data = parsed.db ? parsed.db : parsed;
                                    if (!data.nodes || !data.links) {
                                        alert("Il file selezionato non è un Vault di MappAI valido.");
                                        resolve({ canceled: true });
                                        return;
                                    }
                                    const baseName = file.name.replace('.json', '');
                                    const safeName = baseName.replace(/[^a-zA-Z0-9_]/g, "_");
                                    await window.electronAPI.saveVault({
                                        folderPath: safeName,
                                        mapData: parsed
                                    });
                                    resolve({ canceled: false, folderPath: safeName });
                                } catch (err) {
                                    alert("Errore durante la lettura del file: " + err.message);
                                    resolve({ canceled: true });
                                }
                            };
                            reader.readAsText(file);
                        };
                        input.click();
                    } else {
                        const vaultName = prompt("Inserisci il nome del nuovo Vault:", "Nuovo_Vault");
                        if (!vaultName) {
                            resolve({ canceled: true });
                            return;
                        }
                        const safeName = vaultName.replace(/[^a-zA-Z0-9_]/g, "_");
                        resolve({ canceled: false, folderPath: safeName });
                    }
                });
            } else {
                const vaultName = prompt("Inserisci il nome del nuovo Vault:", "Nuovo_Vault");
                if (!vaultName) return { canceled: true };
                const safeName = vaultName.replace(/[^a-zA-Z0-9_]/g, "_");
                return { canceled: false, folderPath: safeName };
            }
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
            const token = apiKey || window.secureKeys['infomaniak_api_key'] || localStorage.getItem('infomaniak_api_key') || '';
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
                    if (response.status < 200 || response.status >= 300) {
                        const errMsg = parsed?.error?.message || parsed?.error || `Codice di stato HTTP ${response.status}`;
                        return { error: errMsg };
                    }
                    const models = (parsed.data || []).map(m => ({
                        id: m.id,
                        displayName: m.id + ' (Swiss AI)',
                        kb: { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], free: false, inputCost: 0.20, outputCost: 0.40, note: 'Infomaniak Cloud' }
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
                if (!response.ok) {
                    const errMsg = parsed?.error?.message || parsed?.error || `Codice di stato HTTP ${response.status}`;
                    return { error: errMsg };
                }
                const models = (parsed.data || []).map(m => ({
                    id: m.id,
                    displayName: m.id + ' (Swiss AI)',
                    kb: { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], free: false, inputCost: 0.20, outputCost: 0.40, note: 'Infomaniak Cloud' }
                }));
                return models;
            } catch (e) {
                console.error("Errore fetch modelli Infomaniak:", e);
                return { error: e.message };
            }
        },

        listModels: async function (options) {
            const apiKey = (options && options.apiKey) || (window.getSystemKey ? window.getSystemKey() : (window.secureKeys['gemini_api_key'] || localStorage.getItem('gemini_api_key')));
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
            const token = apiKey || window.secureKeys['infomaniak_api_key'] || localStorage.getItem('infomaniak_api_key') || '';
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

        generateGemini: async function (options) {
            const { apiKey, payload, model } = options || {};
            const key = apiKey || (window.getSystemKey ? window.getSystemKey() : (window.secureKeys['gemini_api_key'] || localStorage.getItem('gemini_api_key')));
            const selectedModel = model || localStorage.getItem('gemini_selected_model') || 'gemini-2.5-flash';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${key}`;

            if (isCapacitor && window.Capacitor.Plugins.CapacitorHttp) {
                const { CapacitorHttp } = window.Capacitor.Plugins;
                const response = await CapacitorHttp.request({
                    method: 'POST',
                    url: url,
                    headers: { 'Content-Type': 'application/json' },
                    data: payload
                });
                return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
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

    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    async function checkAndInitIPadDemoVaults() {
        if (!isCapacitor) return;
        try {
            const { Filesystem, Directory } = window.Capacitor.Plugins;
            
            const initialVaultsList = [
                "KG Struttura Albero 1 media",
                "KG Struttura albero Liceo",
                "KG robotica mindstorm gigetto 10 nodi",
                "KG robotica mindstorm gigetto 20 nodi",
                "KG robotica mindstorm gigetto 35 nodi",
                "MM Carta",
                "MM Nascita della Svizzera"
            ];

            // 1. Controlla se la cartella "MappAI - Vault" contiene già l'indice
            let needsInit = false;
            try {
                const idxResult = await Filesystem.readFile({
                    path: 'MappAI - Vault/vaults_index.json',
                    directory: Directory.Documents,
                    encoding: 'utf8'
                });
                const list = JSON.parse(idxResult.data);
                if (!list || list.length === 0) {
                    needsInit = true;
                }
            } catch (e) {
                needsInit = true;
            }

            // 2. Se è la prima inizializzazione, copia eventuali file demo dal manifest
            if (needsInit) {
                console.log("[MappAI Adapter] Inizializzazione MappAI - Vault con file demo...");
                try {
                    const manifestRes = await fetch('./vault_demo_manifest.json');
                    if (manifestRes.ok) {
                        const files = await manifestRes.json();
                        for (const relPath of files) {
                            const srcUrl = `./Vault/${relPath}`;
                            const destPath = `MappAI - Vault/${relPath}`;
                            try {
                                const isBinary = relPath.toLowerCase().endsWith('.pdf');
                                if (isBinary) {
                                    const fileRes = await fetch(srcUrl);
                                    const arrayBuffer = await fileRes.arrayBuffer();
                                    const base64Data = arrayBufferToBase64(arrayBuffer);
                                    await Filesystem.writeFile({
                                        path: destPath,
                                        data: base64Data,
                                        directory: Directory.Documents,
                                        recursive: true
                                    });
                                } else {
                                    const fileRes = await fetch(srcUrl);
                                    const textData = await fileRes.text();
                                    await Filesystem.writeFile({
                                        path: destPath,
                                        data: textData,
                                        directory: Directory.Documents,
                                        encoding: 'utf8',
                                        recursive: true
                                    });
                                }
                            } catch (err) {
                                console.error(`[MappAI Adapter] Errore copia file ${relPath}:`, err);
                            }
                        }
                    }
                } catch (e) {
                    console.warn("[MappAI Adapter] Errore caricamento file manifest:", e);
                }

                // Scrivi l'indice dei vault demo iniziale
                await Filesystem.writeFile({
                    path: 'MappAI - Vault/vaults_index.json',
                    data: JSON.stringify(initialVaultsList),
                    directory: Directory.Documents,
                    encoding: 'utf8',
                    recursive: true
                });
            }

            // 3. Garantisci SEMPRE che le cartelle e i file index.yaml di default per ogni vault demo esistano nel filesystem nativo
            for (const vaultName of initialVaultsList) {
                const vaultPath = `MappAI - Vault/${vaultName}`;
                try {
                    await Filesystem.mkdir({
                        path: vaultPath,
                        directory: Directory.Documents,
                        recursive: true
                    });
                } catch (e) {}

                try {
                    await Filesystem.mkdir({
                        path: `${vaultPath}/Allegati`,
                        directory: Directory.Documents,
                        recursive: true
                    });
                } catch (e) {}

                const indexPath = `${vaultPath}/index.yaml`;
                let hasIndex = false;
                try {
                    await Filesystem.readFile({
                        path: indexPath,
                        directory: Directory.Documents,
                        encoding: 'utf8'
                    });
                    hasIndex = true;
                } catch (e) {
                    hasIndex = false;
                }

                if (!hasIndex) {
                    const defaultIndex = `extractionMode: mindmap\nrootNodeLabel: ${vaultName}\nlastUpdated: ${new Date().toISOString()}\n`;
                    await Filesystem.writeFile({
                        path: indexPath,
                        data: defaultIndex,
                        directory: Directory.Documents,
                        encoding: 'utf8',
                        recursive: true
                    });
                }
            }
            console.log("[MappAI Adapter] Inizializzazione/Verifica cartelle demo completata.");
        } catch (err) {
            console.error("[MappAI Adapter] Errore critico inizializzazione vault su iPad:", err);
        }
    }

    // Avvia la routine di inizializzazione asincrona
    checkAndInitIPadDemoVaults();

    // Disabilita lo zoom pinch nativo a livello di viewport su Safari/iPadOS
    document.addEventListener('gesturestart', function (e) {
        e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturechange', function (e) {
        e.preventDefault();
    }, { passive: false });

    console.log("[MappAI Adapter] Polyfill installato correttamente con successo!");
})();
