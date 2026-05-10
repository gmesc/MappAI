const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const axios = require('axios');
const cheerio = require('cheerio');
const mammoth = require('mammoth');
const os = require('os');
const crypto = require('crypto');

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
}

app.whenReady().then(() => {
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

    updateStatus({ state: 'started', model: model || 'gemini-2.0-flash', message: 'Richiesta inviata a Google...' });

    return new Promise((resolve, reject) => {
        const modelName = model || "gemini-2.0-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }, (res) => {
            updateStatus({ state: 'processing', model: modelName, message: 'Ricezione dati in corso...', statusCode: res.statusCode });
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        updateStatus({ state: 'completed' });
                        resolve(JSON.parse(data));
                    } catch(e) {
                        updateStatus({ state: 'error', message: 'Errore parsing JSON' });
                        reject(new Error("Errore parsing API Response JSON"));
                    }
                } else {
                    updateStatus({ state: 'error', message: `Errore Server ${res.statusCode}` });
                    reject(new Error(`Errore Server ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (e) => {
            updateStatus({ state: 'error', message: e.message });
            reject(e);
        });
        
        req.setTimeout(300000, () => {
             updateStatus({ state: 'timeout' });
             req.abort();
             reject(new Error("Timeout server Google"));
        });

        req.write(JSON.stringify(payload));
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

// IPC Handler to save JSON automatically
ipcMain.handle('save-map-json', async (event, mapData) => {
    try {
        const docPath = app.getPath('documents');
        const saveDir = path.join(docPath, 'Salvataggi MappAI');
        
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

// IPC Handler to save chat transcripts
ipcMain.handle('save-chat-transcript', async (event, { projectName, targetName, textContent, vaultPath }) => {
    try {
        let chatDir;
        if (vaultPath && fs.existsSync(vaultPath)) {
            chatDir = path.join(vaultPath, 'Chat');
        } else {
            const docPath = app.getPath('documents');
            chatDir = path.join(docPath, 'Salvataggi MappAI', 'chat con il tutor');
        }

        if (!fs.existsSync(chatDir)) {
            fs.mkdirSync(chatDir, { recursive: true });
        }

        const now = new Date();
        const dateStr = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}`;
        const fileName = `${projectName}_${targetName}_${dateStr}.txt`.replace(/\s+/g, '_');
        const filePath = path.join(chatDir, fileName);

        const header = `RIFERIMENTO MAPPA: ${projectName}\nDOCUMENTO: ${targetName}\nDATA: ${dateStr}\n------------------------------------------\n\n`;
        // Append or write
        fs.appendFileSync(filePath, header + textContent + '\n\n', 'utf-8');
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
        
        // 1. Save index.yaml (Global Map Config)
        const indexData = {
            extractionMode: mapData.extractionMode,
            rootNodeLabel: mapData.rootNodeLabel,
            lastUpdated: new Date().toISOString()
        };
        const indexYaml = Object.entries(indexData).map(([k,v]) => `${k}: ${v}`).join('\n');
        fs.writeFileSync(path.join(folderPath, 'index.yaml'), indexYaml, 'utf-8');

        // 2. Save Links (Relationship index)
        const linksData = (mapData.links || []).map(l => ({
            source: typeof l.source === 'object' ? l.source.id : l.source,
            target: typeof l.target === 'object' ? l.target.id : l.target,
            isCross: !!l.isCross
        }));
        fs.writeFileSync(path.join(folderPath, 'links.json'), JSON.stringify(linksData, null, 2), 'utf-8');

        // 3. Save Nodes & Allegati directory
        const nodesDir = path.join(folderPath, 'Nodi');
        const allegatiDir = path.join(folderPath, 'Allegati');
        if (!fs.existsSync(nodesDir)) fs.mkdirSync(nodesDir, { recursive: true });
        if (!fs.existsSync(allegatiDir)) fs.mkdirSync(allegatiDir, { recursive: true });

        // 4. Save each node as a Markdown file
        (mapData.nodes || []).forEach(node => {
            const safeLabel = node.label.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const fileName = `${safeLabel}_${node.id}.md`;
            
            let frontmatter = '---\n';
            frontmatter += `id: "${node.id}"\n`;
            frontmatter += `label: "${node.label}"\n`;
            frontmatter += `level: ${node.level}\n`;
            frontmatter += `group: ${node.group || 0}\n`;
            if (node.parent) frontmatter += `parent: "${node.parent}"\n`;
            
            // Handle Images
            const nodeImages = node.images || (node.image ? [node.image] : []);
            const vaultImageRefs = [];
            
            nodeImages.forEach((img, idx) => {
                if (img.startsWith('http')) {
                    vaultImageRefs.push(img); // Keep web URLs
                } else if (fs.existsSync(img)) {
                    // Local file: copy to Allegati
                    const ext = path.extname(img) || '.jpg';
                    const newFileName = `${node.id}_${idx}${ext}`;
                    const destPath = path.join(allegatiDir, newFileName);
                    try {
                        fs.copyFileSync(img, destPath);
                        vaultImageRefs.push(`../Allegati/${newFileName}`);
                    } catch(e) {
                        vaultImageRefs.push(img); // Fallback to original path if copy fails
                    }
                } else {
                    vaultImageRefs.push(img);
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
                    const cText = typeof c === 'string' ? c : (c.text || '');
                    content += `- [${cTitle}]: ${cText}\n`;
                });
            }

            fs.writeFileSync(path.join(nodesDir, fileName), frontmatter + content, 'utf-8');
        });

        return { success: true, path: folderPath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('load-vault', async (event, folderPath) => {
    try {
        if (!fs.existsSync(folderPath)) throw new Error("Cartella non trovata");

        // Load index.yaml
        const indexPath = path.join(folderPath, 'index.yaml');
        const mapData = {
            nodes: [],
            links: [],
            extractionMode: 'mindmap',
            rootNodeLabel: ''
        };
        if (fs.existsSync(indexPath)) {
            const indexContent = fs.readFileSync(indexPath, 'utf-8');
            indexContent.split('\n').forEach(line => {
                if (line.startsWith('extractionMode:')) mapData.extractionMode = line.split(':')[1].trim();
                if (line.startsWith('rootNodeLabel:')) mapData.rootNodeLabel = line.split(':')[1].trim();
            });
        }

        // Load links.json
        const linksPath = path.join(folderPath, 'links.json');
        if (fs.existsSync(linksPath)) {
            mapData.links = JSON.parse(fs.readFileSync(linksPath, 'utf-8'));
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
                    });

                    // Remove embedded images from description text since they are in node.images
                    let body = parts.slice(2).join('---').trim();
                    body = body.replace(/!\[\[.*?\]\]\n\n/g, '');
                    
                    const fontiPart = body.split('## Fonti');
                    if (fontiPart.length > 1) {
                        node.desc = fontiPart[0].replace(/^# .*\n\n/, '').trim();
                        const fontiLines = fontiPart[1].trim().split('\n- ');
                        fontiLines.forEach(f => {
                            const match = f.match(/\[(.*?) \| (.*?)\]: (.*)/);
                            if (match) {
                                node.chunks.push({ title: match[1], source: match[2], text: match[3] });
                            }
                        });
                    } else {
                        node.desc = body.replace(/^# .*\n\n/, '').trim();
                    }
                    mapData.nodes.push(node);
                }
            });
        }
        return { success: true, data: mapData };
    } catch (err) {
        return { success: false, error: err.message };
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
    const saveDir = path.join(docPath, 'Salvataggi Mapp.AI');
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
