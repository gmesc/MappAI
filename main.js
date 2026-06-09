const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const axios = require('axios');
const cheerio = require('cheerio');
const mammoth = require('mammoth');
const os = require('os');
const crypto = require('crypto');
const yaml = require('js-yaml');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "MappAI",
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'public/js/preload.js')
        }
    });

    mainWindow.loadFile('public/index.html');

    // Permette window.open() dal renderer (usato per Stampa Dossier)
    // Senza questo, in Electron 30+ con contextIsolation:true i popup
    // vengono bloccati → window.open() ritorna null → il dossier non si apre
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        return { action: 'allow' };
    });
}

function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    if (isDirectory) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        fs.readdirSync(src).forEach((childItemName) => {
            copyRecursiveSync(path.join(src, childItemName),
                              path.join(dest, childItemName));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

function initDefaultVaultFolder() {
    try {
        const docPath = app.getPath('documents');
        const vaultDir = path.join(docPath, 'MappAI - Vault');
        
        // 1. Crea la cartella se non esiste
        if (!fs.existsSync(vaultDir)) {
            fs.mkdirSync(vaultDir, { recursive: true });
        }

        // 2. Copia i file demo se presenti nel pacchetto
        const demoBundledDir = path.join(__dirname, 'public', 'vault_demo');
        if (fs.existsSync(demoBundledDir)) {
            const items = fs.readdirSync(demoBundledDir);
            items.forEach(item => {
                const srcPath = path.join(demoBundledDir, item);
                const destPath = path.join(vaultDir, item);
                if (!fs.existsSync(destPath)) {
                    copyRecursiveSync(srcPath, destPath);
                }
            });
        }
    } catch (err) {
        console.error("Errore inizializzazione default vault:", err);
    }
}

// In dev mode (npm start), separa userData in una sottocartella "dev/"
// per non contaminare il localStorage dell'app installata sullo stesso Mac.
// In produzione (.app installata) usa il path standard.
if (!app.isPackaged) {
    app.setPath('userData', path.join(app.getPath('userData'), 'dev'));
}

app.whenReady().then(() => {
    initDefaultVaultFolder();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC handler for proxying Gemini requests
ipcMain.handle('generate-gemini', async (event, { apiKey, payload, model }) => {
    const statusPath = path.join(__dirname, '.gemini_status.json');
    const updateStatus = (data) => {
        try { fs.writeFileSync(statusPath, JSON.stringify({ ...data, timestamp: Date.now() })); } catch(e) {}
    };

    const modelName = model || "gemini-2.0-flash";
    updateStatus({ state: 'started', model: modelName, message: 'Richiesta inviata a Google...' });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    try {
        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 600000 // 10 minutes timeout for complex maps
        });
        
        updateStatus({ state: 'completed' });
        return response.data;
    } catch (error) {
        let errorMsg = error.message;
        if (error.response && error.response.data) {
            errorMsg = JSON.stringify(error.response.data);
        }
        updateStatus({ state: 'error', message: errorMsg });
        throw new Error(errorMsg);
    }
});

// IPC handler for proxying Infomaniak requests
ipcMain.handle('generate-infomaniak', async (event, { apiKey, payload, productId }) => {
    // Infomaniak endpoint: https://api.infomaniak.com/2/ai/{product_id}/openai/v1/chat/completions
    const url = `https://api.infomaniak.com/2/ai/${productId}/openai/v1/chat/completions`;

    try {
        // Forza stream per bypassare il Gateway Timeout
        payload.stream = true;

        const response = await axios.post(url, payload, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            responseType: 'stream'
        });

        return new Promise((resolve, reject) => {
            let fullText = '';
            let lastChunk = null;

            response.data.on('data', (chunk) => {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6);
                        if (dataStr.trim() === '[DONE]') continue;
                        try {
                            const dataObj = JSON.parse(dataStr);
                            lastChunk = dataObj;
                            const delta = dataObj.choices && dataObj.choices[0] && dataObj.choices[0].delta;
                            if (delta && delta.content) {
                                fullText += delta.content;
                            }
                        } catch (e) {
                            // ignora errori di parsing parziali
                        }
                    }
                }
            });

            response.data.on('end', () => {
                // Diagnostica: stream vuoto = problema lato provider (param rifiutati, ecc.)
                if (!fullText) {
                    console.warn('[Infomaniak] Stream VUOTO. finish_reason:',
                        lastChunk?.choices?.[0]?.finish_reason,
                        '| lastChunk:', JSON.stringify(lastChunk));
                    console.warn('[Infomaniak] Payload inviato (max_tokens, model):',
                        payload.max_tokens, payload.model,
                        '| response_format:', JSON.stringify(payload.response_format));
                }
                // Ricostruisci il formato standard atteso da InfomaniakBridge
                resolve({
                    id: lastChunk?.id || 'stream',
                    object: 'chat.completion',
                    created: lastChunk?.created || Math.floor(Date.now() / 1000),
                    model: lastChunk?.model || payload.model,
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: 'assistant',
                                content: fullText
                            },
                            finish_reason: lastChunk?.choices?.[0]?.finish_reason || 'stop'
                        }
                    ],
                    usage: lastChunk?.usage || {}
                });
            });

            response.data.on('error', (err) => {
                reject(new Error(err.message));
            });
        });

    } catch (error) {
        let errorMsg = error.message;
        if (error.response) {
            const status = error.response.status;
            // Con responseType:'stream', error.response.data è uno stream — non serializzabile.
            // Leggiamo il body come testo.
            try {
                const bodyText = await new Promise((resolve) => {
                    let buf = '';
                    error.response.data.on('data', c => buf += c.toString());
                    error.response.data.on('end', () => resolve(buf));
                    error.response.data.on('error', () => resolve(''));
                });
                console.error("Infomaniak Full Error Data:", bodyText);
                errorMsg = `Infomaniak Error (${status}): ${bodyText}`;
            } catch (_) {
                errorMsg = `Infomaniak Error (${status}): ${error.message}`;
            }
        }
        console.error("Infomaniak API Error:", errorMsg);
        throw new Error(errorMsg);
    }
});

// IPC handler per embeddings Infomaniak (default: bge-multilingual-gemma2).
// Endpoint: /openai/v1/embeddings (OpenAI-compatible, no streaming).
ipcMain.handle('generate-embeddings-infomaniak', async (event, { apiKey, productId, model, texts }) => {
    const url = `https://api.infomaniak.com/2/ai/${productId}/openai/v1/embeddings`;
    const payload = {
        model: model || 'bge-multilingual-gemma2',
        input: Array.isArray(texts) ? texts : [String(texts || '')]
    };
    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        const data = response.data || {};
        const embeddings = (data.data || []).map(item => item.embedding);
        return {
            embeddings,
            model: data.model || payload.model,
            usage: data.usage || null
        };
    } catch (error) {
        const msg = error.response?.data?.error?.message || error.message;
        const code = error.response?.status || 'N/A';
        throw new Error(`Infomaniak Embeddings Error (${code}): ${msg}`);
    }
});

// IPC handler for listing available Infomaniak models
ipcMain.handle('list-infomaniak-models', async (event, { apiKey, productId }) => {
    return new Promise((resolve, reject) => {
        const url = `https://api.infomaniak.com/2/ai/${productId}/openai/v1/models`;
        console.log(`[MappAI] Fetching Infomaniak models from: ${url}`);

        const req = https.request(url, {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json' 
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`[MappAI] Infomaniak response status: ${res.statusCode}`);
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const parsed = JSON.parse(data);
                        console.log(`[MappAI] Infomaniak parsed models count:`, parsed.data ? parsed.data.length : 'no data array');
                        const models = (parsed.data || []).map(m => ({
                            id: m.id,
                            displayName: m.id + ' (Swiss AI)',
                            kb: { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], free: false, inputCost: 0, outputCost: 0, note: 'Infomaniak Cloud' }
                        }));
                        resolve(models);
                    } catch(e) {
                        console.error(`[MappAI] Infomaniak JSON parsing error. Raw data:`, data);
                        reject(new Error("Errore parsing lista modelli Infomaniak"));
                    }
                } else {
                    console.error(`[MappAI] Infomaniak server error ${res.statusCode}. Raw data:`, data);
                    reject(new Error(`Errore Server Infomaniak ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (e) => {
            console.error(`[MappAI] Infomaniak request error:`, e);
            reject(e);
        });
        req.setTimeout(30000, () => { 
            console.error(`[MappAI] Infomaniak request timeout`);
            req.abort(); 
            reject(new Error("Timeout API Infomaniak")); 
        });
        req.end();
    });
});

// IPC handler for listing available Gemini models
ipcMain.handle('list-models', async (event, { apiKey }) => {
    return new Promise((resolve, reject) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

        const req = https.request(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const parsed = JSON.parse(data);
                        // Filter only models that support generateContent
                        const models = (parsed.models || [])
                            .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                            .map(m => ({
                                id: m.name.replace('models/', ''),
                                displayName: m.displayName || m.name.replace('models/', ''),
                                description: m.description || ''
                            }));
                        resolve(models);
                    } catch(e) {
                        reject(new Error("Errore parsing lista modelli"));
                    }
                } else {
                    reject(new Error(`Errore Server ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.setTimeout(30000, () => { req.abort(); reject(new Error("Timeout")); });
        req.end();
    });
});

ipcMain.handle('open-external', async (event, url) => {
    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// Capture current window content as image
ipcMain.handle('capture-page', async () => {
    if (!mainWindow) return null;
    const image = await mainWindow.capturePage();
    return image.toDataURL();
});

// IPC Handler to save JSON automatically
ipcMain.handle('save-map-json', async (event, mapData) => {
    try {
        const docPath = app.getPath('documents');
        const saveDir = path.join(docPath, 'MappAI - Vault');
        
        if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir, { recursive: true });
        }

        // Build filename: mm_ or kg_ prefix + rootNodeLabel keyword
        const prefix = (mapData.extractionMode === 'mindmap') ? 'mm' : 'kg';
        const label = mapData.rootNodeLabel || (mapData.nodes && mapData.nodes[0] ? mapData.nodes[0].label : 'mappa');
        const safeLabel = label.replace(/[^a-z0-9àèéìòù]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase();
        const fileName = `${prefix}_${safeLabel}.json`;
        const filePath = path.join(saveDir, fileName);

        fs.writeFileSync(filePath, JSON.stringify(mapData, null, 2), 'utf-8');
        return { success: true, path: filePath, folder: saveDir };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// IPC Handler: salva un artefatto intermedio di pipeline (es. checkpoint L1).
// NON tocca il Vault dell'utente: scrive in una cartella "bus" sotto userData,
// organizzata per run. Usato da mappai-l1-checkpoint.js per materializzare lo
// stato tra una fase e l'altra (debug / resume / revisione umana).
ipcMain.handle('save-pipeline-artifact', async (event, { runId, fileName, content }) => {
    try {
        const safeRun = String(runId || 'run').replace(/[^a-z0-9_\-]/gi, '_');
        const safeName = String(fileName || 'artifact.json').replace(/[^a-z0-9_\-.]/gi, '_');
        const baseDir = path.join(app.getPath('userData'), 'MappAI-Pipeline');
        const runDir = path.join(baseDir, safeRun);
        if (!fs.existsSync(runDir)) fs.mkdirSync(runDir, { recursive: true });
        const filePath = path.join(runDir, safeName);
        fs.writeFileSync(filePath, typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf-8');
        return { success: true, path: filePath, folder: runDir, baseFolder: baseDir };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// IPC Handler: apre nel file manager la cartella bus di pipeline (root o di un run).
ipcMain.handle('open-pipeline-folder', async (event, { runId } = {}) => {
    try {
        const baseDir = path.join(app.getPath('userData'), 'MappAI-Pipeline');
        let target = baseDir;
        if (runId) {
            const safeRun = String(runId).replace(/[^a-z0-9_\-]/gi, '_');
            const runDir = path.join(baseDir, safeRun);
            if (fs.existsSync(runDir)) target = runDir;
        }
        if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
        await shell.openPath(target);
        return { success: true, path: target };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// IPC Handler to save PDF binary files directly to the Vault
ipcMain.handle('save-pdf-to-vault', async (event, { base64Data, fileName, vaultPath }) => {
    try {
        let destDir;
        if (vaultPath && fs.existsSync(vaultPath)) {
            destDir = vaultPath;
        } else {
            const docPath = app.getPath('documents');
            destDir = path.join(docPath, 'MappAI - Vault');
        }

        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        const filePath = path.join(destDir, fileName);
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(filePath, buffer);
        return { success: true, path: filePath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// IPC Handler to save chat transcripts
ipcMain.handle('save-chat-transcript', async (event, { projectName, targetName, textContent, vaultPath, subFolder }) => {
    try {
        let chatDir;
        const targetSubFolder = subFolder || 'Chat';
        if (vaultPath && fs.existsSync(vaultPath)) {
            chatDir = path.join(vaultPath, targetSubFolder);
        } else {
            const docPath = app.getPath('documents');
            chatDir = path.join(docPath, 'MappAI - Vault', targetSubFolder);
        }

        if (!fs.existsSync(chatDir)) {
            fs.mkdirSync(chatDir, { recursive: true });
        }

        const now = new Date();
        const dateStr = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}`;
        const fileName = `${projectName}_${targetName}_${dateStr}.txt`.replace(/\s+/g, '_');
        const filePath = path.join(chatDir, fileName);

        const exists = fs.existsSync(filePath);
        const header = `RIFERIMENTO MAPPA: ${projectName}\nDOCUMENTO: ${targetName}\nDATA: ${dateStr}\n------------------------------------------\n\n`;
        
        // Append textContent, add header ONLY if new file
        fs.appendFileSync(filePath, (exists ? "" : header) + textContent + '\n\n', 'utf-8');
        return { success: true, path: filePath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// IPC Handler to save quiz text response
ipcMain.handle('save-quiz-text-response', async (event, { title, textContent, vaultPath }) => {
    try {
        let quizDir;
        if (vaultPath && fs.existsSync(vaultPath)) {
            quizDir = path.join(vaultPath, 'Quiz e Flashcard');
        } else {
            const docPath = app.getPath('documents');
            quizDir = path.join(docPath, 'MappAI - Vault', 'Quiz e Flashcard');
        }

        if (!fs.existsSync(quizDir)) {
            fs.mkdirSync(quizDir, { recursive: true });
        }

        const safeTitle = (title || "Quiz").replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const filename = `risposte_quiz_${safeTitle}_${Date.now()}.txt`;
        const filePath = path.join(quizDir, filename);

        fs.writeFileSync(filePath, textContent, 'utf-8');
        return { success: true, path: filePath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// ==========================================
// DATA ABSTRACTION LAYER (DAL) - MARKDOWN VAULT
// ==========================================

ipcMain.handle('save-vault', async (event, { folderPath, mapData }) => {
    try {
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
        
        // 1. Save index.yaml (Global Map Config) — serializzato con js-yaml
        const indexData = {
            extractionMode: mapData.extractionMode,
            rootNodeLabel: mapData.rootNodeLabel,
            userProfile: mapData.userProfile || null,
            customColors: mapData.customColors || {},
            generationUsage: mapData.generationUsage || null,
            lastUpdated: new Date().toISOString()
        };
        const indexYaml = yaml.dump(indexData, { lineWidth: -1, quotingType: '"', forceQuotes: false });
        fs.writeFileSync(path.join(folderPath, 'index.yaml'), indexYaml, 'utf-8');

        // 2. Save Links (Relationship index)
        const linksData = (mapData.links || []).map(l => ({
            source: typeof l.source === 'object' ? l.source.id : l.source,
            target: typeof l.target === 'object' ? l.target.id : l.target,
            rel: l.rel || "",
            isCross: !!l.isCross
        }));
        fs.writeFileSync(path.join(folderPath, 'links.json'), JSON.stringify(linksData, null, 2), 'utf-8');

        // 3. Save Nodes & Allegati directory (Updated)
        const nodesDir = path.join(folderPath, 'Nodi');
        const allegatiDir = path.join(folderPath, 'Allegati');
        if (!fs.existsSync(nodesDir)) fs.mkdirSync(nodesDir, { recursive: true });
        if (!fs.existsSync(allegatiDir)) fs.mkdirSync(allegatiDir, { recursive: true });

        // Collect all links for the summary file
        const globalLinks = [];

        // 4a. Elimina i file .md orfani (nodi rimossi via merge/relink non sono più in mapData.nodes)
        const validNodeFileNames = new Set(
            (mapData.nodes || []).map(node => {
                const safeLabel = node.label.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                return `${safeLabel}_${node.id}.md`;
            })
        );
        try {
            fs.readdirSync(nodesDir).forEach(file => {
                if (file.endsWith('.md') && !validNodeFileNames.has(file)) {
                    fs.unlinkSync(path.join(nodesDir, file));
                }
            });
        } catch(e) {
            console.warn('[Vault] Pulizia file orfani fallita:', e.message);
        }

        // 4b. Save each node as a Markdown file
        (mapData.nodes || []).forEach(node => {
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
            
            // Handle Links Summary
            const nodeUrls = node.urls || (node.url ? [node.url] : []);
            nodeUrls.forEach(u => {
                if (u) globalLinks.push(`- [${node.label}] (${node.id}): ${u}`);
            });
            if (nodeUrls.length > 0) frontmatter += `urls: ${JSON.stringify(nodeUrls)}\n`;

            // Handle Images
            const nodeImages = node.images || (node.image ? [node.image] : []);
            const vaultImageRefs = [];
            
            nodeImages.forEach((img, idx) => {
                if (!img) return;
                
                if (img.startsWith('http')) {
                    vaultImageRefs.push(img); 
                } else if (img.startsWith('data:image')) {
                    // Handle Base64 Data URL
                    try {
                        const parts = img.split(';base64,');
                        const mime = parts[0].split(':')[1];
                        const ext = '.' + (mime.split('/')[1] || 'jpg');
                        const base64Data = parts[1];
                        const buffer = Buffer.from(base64Data, 'base64');
                        
                        const newFileName = `${node.id}_up_${idx}${ext}`;
                        const destPath = path.join(allegatiDir, newFileName);
                        fs.writeFileSync(destPath, buffer);
                        vaultImageRefs.push(`../Allegati/${newFileName}`);
                    } catch(e) {
                        vaultImageRefs.push(img);
                    }
                } else {
                    // Local file handling
                    let cleanPath = img.replace('file://', '');
                    try { cleanPath = decodeURIComponent(cleanPath); } catch(e) {}
                    
                    if (fs.existsSync(cleanPath)) {
                        const ext = path.extname(cleanPath) || '.jpg';
                        const newFileName = `${node.id}_${idx}${ext}`;
                        const destPath = path.join(allegatiDir, newFileName);
                        try {
                            fs.copyFileSync(cleanPath, destPath);
                            vaultImageRefs.push(`../Allegati/${newFileName}`);
                        } catch(e) {
                            vaultImageRefs.push(img);
                        }
                    } else {
                        vaultImageRefs.push(img);
                    }
                }
            });

            if (vaultImageRefs.length > 0) {
                frontmatter += `images: ${JSON.stringify(vaultImageRefs)}\n`;
            }
            frontmatter += '---\n\n';

            let content = `# ${node.label}\n\n`;
            
            // Add images to content
            vaultImageRefs.forEach(ref => {
                content += `![[${ref}]]\n\n`;
            });

            content += node.desc || "";
            
            if (node.chunks && node.chunks.length > 0) {
                content += "\n\n## Fonti\n";
                node.chunks.forEach(c => {
                    const cTitle = typeof c === 'string' ? 'Estratto' : (c.title || 'Estratto');
                    const cSource = typeof c === 'string' ? 'Originale' : (c.source || 'Originale');
                    const cText = typeof c === 'string' ? c : (c.text || '');
                    content += `- [${cTitle} | ${cSource}]: ${cText}\n`;
                });
            }

            fs.writeFileSync(path.join(nodesDir, fileName), frontmatter + content, 'utf-8');
        });
        
        // 5. Save Global Links Summary
        const summaryHeader = `INDICE FONTI E LINK - ${mapData.rootNodeLabel}\n`;
        const summaryTxt = summaryHeader + "=".repeat(summaryHeader.length) + "\n\n" + 
                          (globalLinks.length > 0 ? globalLinks.join('\n') : "Nessun link esterno trovato.");
        fs.writeFileSync(path.join(folderPath, 'fonti_e_link.txt'), summaryTxt, 'utf-8');

        // 6. Save Tutor Chat State
        if (mapData.tutorState) {
            fs.writeFileSync(path.join(folderPath, 'chat_state.json'), JSON.stringify(mapData.tutorState, null, 2), 'utf-8');
        }

        // 7. Save Study Sets (Quiz e Flashcard)
        const studyDir = path.join(folderPath, 'Materiale Studio');
        if (mapData.studySets && mapData.studySets.length > 0) {
            if (!fs.existsSync(studyDir)) fs.mkdirSync(studyDir, { recursive: true });
            mapData.studySets.forEach(set => {
                const safeTitle = set.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const fileName = `${safeTitle}_${set.id}.json`;
                fs.writeFileSync(path.join(studyDir, fileName), JSON.stringify(set, null, 2), 'utf-8');
            });
        }

        // 8. Return upgrades for image paths (Base64 -> Local File)
        const upgrades = (mapData.nodes || []).map(node => {
            const nodeImages = node.images || (node.image ? [node.image] : []);
            const absoluteVaultPaths = [];
            
            nodeImages.forEach((img, idx) => {
                if (!img || img.startsWith('http')) {
                    absoluteVaultPaths.push(img);
                } else if (img.startsWith('data:image')) {
                    const parts = img.split(';base64,');
                    const mime = parts[0].split(':')[1];
                    const ext = '.' + (mime.split('/')[1] || 'jpg');
                    const newFileName = `${node.id}_up_${idx}${ext}`;
                    absoluteVaultPaths.push(path.join(allegatiDir, newFileName));
                } else {
                    let cleanPath = img.replace('file://', '');
                    try { cleanPath = decodeURIComponent(cleanPath); } catch(e) {}
                    const ext = path.extname(cleanPath) || '.jpg';
                    const newFileName = `${node.id}_${idx}${ext}`;
                    absoluteVaultPaths.push(path.join(allegatiDir, newFileName));
                }
            });

            return { id: node.id, images: absoluteVaultPaths };
        });

        return { success: true, path: folderPath, upgrades: upgrades };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('load-vault', async (event, folderPath) => {
    try {
        if (!fs.existsSync(folderPath)) throw new Error("Cartella non trovata");

        // Load index.yaml — parsing robusto con js-yaml
        const indexPath = path.join(folderPath, 'index.yaml');
        const mapData = {
            nodes: [],
            links: [],
            extractionMode: 'mindmap',
            rootNodeLabel: ''
        };
        if (fs.existsSync(indexPath)) {
            try {
                const indexContent = fs.readFileSync(indexPath, 'utf-8');
                const parsed = yaml.load(indexContent) || {};
                if (parsed.extractionMode)  mapData.extractionMode  = parsed.extractionMode;
                if (parsed.rootNodeLabel)   mapData.rootNodeLabel   = parsed.rootNodeLabel;
                if (parsed.userProfile)     mapData.userProfile     = parsed.userProfile;
                if (parsed.customColors)    mapData.customColors    = parsed.customColors;
                if (parsed.generationUsage !== undefined) mapData.generationUsage = parsed.generationUsage;
            } catch(e) {
                console.warn('[MappAI] Errore parsing index.yaml con js-yaml, fallback manuale:', e.message);
                // Fallback legacy per vault creati con il vecchio formato
                const indexContent = fs.readFileSync(indexPath, 'utf-8');
                indexContent.split('\n').forEach(line => {
                    if (line.startsWith('extractionMode:')) mapData.extractionMode = line.split(':')[1].trim();
                    if (line.startsWith('rootNodeLabel:'))  mapData.rootNodeLabel  = line.substring(line.indexOf(':') + 1).trim();
                    if (line.startsWith('userProfile:'))    { try { mapData.userProfile     = JSON.parse(line.substring(line.indexOf(':') + 1).trim()); } catch(_){} }
                    if (line.startsWith('customColors:'))   { try { mapData.customColors    = JSON.parse(line.substring(line.indexOf(':') + 1).trim()); } catch(_){} }
                    if (line.startsWith('generationUsage:')){ try { mapData.generationUsage = JSON.parse(line.substring(line.indexOf(':') + 1).trim()); } catch(_){} }
                });
            }
        }

        // Load Tutor State
        const tutorPath = path.join(folderPath, 'chat_state.json');
        if (fs.existsSync(tutorPath)) {
            mapData.tutorState = JSON.parse(fs.readFileSync(tutorPath, 'utf-8'));
        }

        // Load links.json
        const linksPath = path.join(folderPath, 'links.json');
        if (fs.existsSync(linksPath)) {
            const rawLinks = JSON.parse(fs.readFileSync(linksPath, 'utf-8'));
            mapData.links = rawLinks.map(l => ({
                source: l.source,
                target: l.target,
                rel: l.rel || "include",
                isCross: !!l.isCross
            }));
        }

        // Load Nodes
        const nodesDir = path.join(folderPath, 'Nodi');
        if (fs.existsSync(nodesDir)) {
            const files = fs.readdirSync(nodesDir).filter(f => f.endsWith('.md'));
            files.forEach(file => {
                const content = fs.readFileSync(path.join(nodesDir, file), 'utf-8');
                const parts = content.split('---');
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
                            try { node.images = JSON.parse(v); } catch(e) {}
                        }
                        if (k === 'iconVisibility') {
                            try { node.iconVisibility = JSON.parse(v); } catch(e) {}
                        }
                        if (k === 'hasCustomText') node.hasCustomText = (cleanV === 'true');
                        if (k === 'hasCustomImage') node.hasCustomImage = (cleanV === 'true');
                        if (k === 'x') { node.x = parseFloat(cleanV); node.fx = node.x; }
                        if (k === 'y') { node.y = parseFloat(cleanV); node.fy = node.y; }
                        if (k === 'savedX') node.savedX = parseFloat(cleanV);
                        if (k === 'savedY') node.savedY = parseFloat(cleanV);
                    });

                    // Remove embedded images from description text since they are in node.images
                    let body = parts.slice(2).join('---').trim();
                    body = body.replace(/!\[\[.*?\]\]\n\n/g, '');
                    
                    const fontiPart = body.split('## Fonti');
                    if (fontiPart.length > 1) {
                        node.desc = fontiPart[0].replace(/^# .*\n\n/, '').trim();
                        const fontiLines = fontiPart[1].trim().split('\n- ');
                        fontiLines.forEach(f => {
                            // Strip leading "- " if present due to split or format
                            let cleanLine = f.replace(/^- /, '').trim();
                            const matchWithSource = cleanLine.match(/\[(.*?) \| (.*?)\]: (.*)/);
                            if (matchWithSource) {
                                node.chunks.push({ title: matchWithSource[1], source: matchWithSource[2], text: matchWithSource[3] });
                            } else {
                                // Fallback for legacy vaults without " | Source"
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
            });
        }
        // Load Study Sets
        mapData.studySets = [];
        const studyDir = path.join(folderPath, 'Materiale Studio');
        if (fs.existsSync(studyDir)) {
            const files = fs.readdirSync(studyDir).filter(f => f.endsWith('.json'));
            files.forEach(file => {
                try {
                    const content = fs.readFileSync(path.join(studyDir, file), 'utf-8');
                    const set = JSON.parse(content);
                    mapData.studySets.push(set);
                } catch(e) {}
            });
        }

        return { success: true, data: mapData };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-all-vaults', async () => {
    try {
        const docPath = app.getPath('documents');
        const saveDir = path.join(docPath, 'MappAI - Vault');
        if (!fs.existsSync(saveDir)) return [];

        const folders = fs.readdirSync(saveDir).filter(f => {
            return fs.statSync(path.join(saveDir, f)).isDirectory();
        });

        const vaults = [];
        folders.forEach(f => {
            const vaultPath = path.join(saveDir, f);
            const indexPath = path.join(vaultPath, 'index.yaml');
            if (fs.existsSync(indexPath)) {
                const vaultInfo = { folderName: f, fullPath: vaultPath };
                try {
                    const indexContent = fs.readFileSync(indexPath, 'utf-8');
                    const parsed = yaml.load(indexContent) || {};
                    vaultInfo.extractionMode = parsed.extractionMode || 'mindmap';
                    vaultInfo.rootNodeLabel  = parsed.rootNodeLabel  || f;
                    vaultInfo.lastUpdated    = parsed.lastUpdated    || '';
                    if (parsed.userProfile) {
                        vaultInfo.nickname = parsed.userProfile.nickname;
                        vaultInfo.age      = parsed.userProfile.age;
                    }
                } catch(e) {
                    console.warn(`[MappAI] Errore parsing index.yaml in ${f}:`, e.message);
                    // Fallback legacy
                    const indexContent = fs.readFileSync(indexPath, 'utf-8');
                    indexContent.split('\n').forEach(line => {
                        if (line.startsWith('extractionMode:')) vaultInfo.extractionMode = line.split(':')[1].trim();
                        if (line.startsWith('rootNodeLabel:'))  vaultInfo.rootNodeLabel  = line.substring(line.indexOf(':') + 1).trim();
                        if (line.startsWith('lastUpdated:'))    vaultInfo.lastUpdated    = line.split('lastUpdated:')[1].trim();
                        if (line.startsWith('userProfile:')) {
                            try { const p = JSON.parse(line.substring(line.indexOf(':') + 1).trim()); vaultInfo.nickname = p.nickname; vaultInfo.age = p.age; } catch(_){}
                        }
                    });
                }
                vaults.push(vaultInfo);
            }
        });

        // Sort by lastUpdated desc
        return vaults.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
    } catch (err) {
        console.error("Errore get-all-vaults:", err);
        return [];
    }
});

// Restituisce l'elenco di cartelle vault che EFFETTIVAMENTE ESISTONO
// (per ripulire progetti stale da localStorage)
ipcMain.handle('get-valid-vault-folders', async (event) => {
    try {
        const docPath = app.getPath('documents');
        const vaultBaseDir = path.join(docPath, 'MappAI - Vault');

        if (!fs.existsSync(vaultBaseDir)) return [];

        const folders = fs.readdirSync(vaultBaseDir).filter(f => {
            return fs.statSync(path.join(vaultBaseDir, f)).isDirectory();
        });

        return folders; // Ritorna nomi delle cartelle che esistono
    } catch (err) {
        console.warn('[MappAI] Errore get-valid-vault-folders:', err);
        return [];
    }
});

ipcMain.handle('pick-folder', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Seleziona la cartella del Vault (Second Brain)'
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return { canceled: false, folderPath: result.filePaths[0] };
    }
    return { canceled: true };
});

// IPC Handler to open the specific folder in macOS Finder
ipcMain.handle('open-save-folder', async () => {
    const docPath = app.getPath('documents');
    const saveDir = path.join(docPath, 'MappAI - Vault');
    if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
    }
    shell.openPath(saveDir);
});

// IPC Handler for Google File API Upload (for Audio/Video)
ipcMain.handle('upload-file-gemini', async (event, { apiKey, filePath, mimeType, displayName }) => {
    return new Promise((resolve, reject) => {
        const stats = fs.statSync(filePath);
        const fileSize = stats.size;
        const fileName = path.basename(filePath);

        // Phase 1: Initial request to get resumable URL
        const options = {
            hostname: 'generativelanguage.googleapis.com',
            path: `/upload/v1beta/files?key=${apiKey}`,
            method: 'POST',
            headers: {
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'start',
                'X-Goog-Upload-Header-Content-Length': fileSize,
                'X-Goog-Upload-Header-Content-Type': mimeType,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            const uploadUrl = res.headers['x-goog-upload-url'];
            if (!uploadUrl) {
                reject(new Error("Fallito recupero URL di caricamento"));
                return;
            }

            // Phase 2: Actual Upload
            const fileStream = fs.createReadStream(filePath);
            const uploadReq = https.request(uploadUrl, {
                method: 'POST',
                headers: {
                    'X-Goog-Upload-Command': 'upload, finalize',
                    'X-Goog-Upload-Offset': 0,
                    'Content-Length': fileSize
                }
            }, (uploadRes) => {
                let data = '';
                uploadRes.on('data', chunk => data += chunk);
                uploadRes.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed.file); // Returns the file object with URI
                    } catch (e) {
                        reject(new Error("Errore parsing risposta upload"));
                    }
                });
            });

            uploadReq.on('error', (e) => reject(e));
            fileStream.pipe(uploadReq);
        });

        req.on('error', (e) => reject(e));
        req.write(JSON.stringify({ file: { display_name: displayName || fileName } }));
        req.end();
    });
});

// IPC Handler to pick a local file
ipcMain.handle('pick-file', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        title: 'Seleziona Documento da collegare al Nodo'
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        return { canceled: false, filePath: result.filePaths[0] };
    }
    return { canceled: true };
});

// IPC Handler to extract text from DOCX
ipcMain.handle('parse-docx', async (event, filePath) => {
    try {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
    } catch (err) {
        throw new Error("Errore parsing DOCX: " + err.message);
    }
});

// IPC Handler to get Machine ID for offline algorithmic lock
ipcMain.handle('get-machine-id', () => {
    const interfaces = os.networkInterfaces();
    let macAddress = '';
    for (let key in interfaces) {
        for (let net of interfaces[key]) {
            if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
                macAddress = net.mac;
                break;
            }
        }
        if (macAddress) break;
    }
    const cpu = os.cpus()[0] ? os.cpus()[0].model : 'UNKNOWN-CPU';
    const rawId = macAddress + '-' + cpu;
    return crypto.createHash('sha256').update(rawId).digest('hex').substring(0, 10).toUpperCase();
});
// IPC Handler to fetch and scrape URL content
ipcMain.handle('fetch-url', async (event, url) => {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000
        });
        const $ = cheerio.load(response.data);
        
        // Remove scripts and styles
        $('script, style, nav, footer, header, aside').remove();
        
        let text = '';
        if (url.includes('wikipedia.org')) {
            text = $('#mw-content-text p').text();
        } else {
            text = $('body').text();
        }
        
        return { success: true, text: text.replace(/\s+/g, ' ').trim().substring(0, 50000) };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// IPC Handler to load prompts configuration
ipcMain.handle('load-prompts', async () => {
    try {
        // 1. Carica i prompt di sistema (default)
        const defaultPromptsPath = path.join(__dirname, 'prompts_config.json');
        let combinedPrompts = {};
        if (fs.existsSync(defaultPromptsPath)) {
            const data = fs.readFileSync(defaultPromptsPath, 'utf-8');
            combinedPrompts = JSON.parse(data);
        }
        
        // 2. Sovrapponi i prompt personalizzati dall'utente (se esistono)
        const userDataPath = app.getPath('userData');
        const userPromptsPath = path.join(userDataPath, 'prompts_config.json');
        if (fs.existsSync(userPromptsPath)) {
            const userData = fs.readFileSync(userPromptsPath, 'utf-8');
            const overrides = JSON.parse(userData);
            combinedPrompts = { ...combinedPrompts, ...overrides };
        }
        
        return { success: true, data: combinedPrompts };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// IPC Handler to save prompts configuration
ipcMain.handle('save-prompts', async (event, promptsData) => {
    try {
        const userDataPath = app.getPath('userData');
        const userPromptsPath = path.join(userDataPath, 'prompts_config.json');
        
        fs.writeFileSync(userPromptsPath, JSON.stringify(promptsData, null, 4), 'utf-8');
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});
