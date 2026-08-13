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
// Servizio LLM locale per gli NPC narranti. Require sicuro: node-llama-cpp
// è caricato lazy SOLO al primo uso (vedi main_npc_llm.js). Se la dep manca,
// il servizio resta dormiente e gli handler ritornano un errore gestito.
const npcLlm = require('./main_npc_llm');
// Logica pura organizzazione file (010): nomi cartelle, gerarchia per-classe,
// piano migrazione, parsing sessioni. UMD → in Node ritorna module.exports.
const FilesCore = require('./public/js/mappai-files-core.js');

let mainWindow;
let launcherWindow;
let studioWindow;

// Launcher all'avvio: scegli MappAI o Memory Dungeon Studio.
// Presente ANCHE nella build pacchettizzata (richiesta 7/7/26: i docenti devono
// poter entrare nello Studio dall'app installata).
function createLauncherWindow() {
    launcherWindow = new BrowserWindow({
        width: 640,
        height: 420,
        resizable: false,
        title: "MappAI — Avvio",
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'public/js/preload.js')
        }
    });
    launcherWindow.loadFile('public/launcher.html');
    launcherWindow.on('closed', () => { launcherWindow = null; });
}

// Memory Dungeon Studio: landing (tools/voxel-proto/studio.html) → editor voxel.
// Preload AGGANCIATO: la landing legge i vault via IPC (getAllVaults/loadVault/
// loadDungeonFloors) e l'editor salva i piani nel vault (saveDungeonFloor).
// three r164 VENDORED (public/js/vendor/three-r164.module.min.js) → offline ok.
function createStudioWindow() {
    studioWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        title: "Memory Dungeon Studio",
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'public/js/preload.js')
        }
    });
    studioWindow.loadFile('tools/voxel-proto/studio.html');
    studioWindow.on('closed', () => { studioWindow = null; });
}

ipcMain.handle('launcher-choice', (event, choice) => {
    if (choice === 'studio') createStudioWindow();
    else createWindow();
    if (launcherWindow) launcherWindow.close();
    return true;
});

// Uscita segreta: 5 click nell'angolo in alto a sinistra (landing MappAI o Studio)
// → torna alla schermata di scelta iniziale chiudendo la finestra corrente.
ipcMain.handle('launcher-return', (event) => {
    createLauncherWindow();
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && win !== launcherWindow) win.close();
    return true;
});

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

    // Trace opzionale: con MAPPAI_TRACE=1 inoltra la console del RENDERER allo stdout,
    // così `npm start 2>&1 | tee run.log` cattura l'intera pipeline da terminale.
    // Off di default (zero impatto). Reversibile.
    if (process.env.MAPPAI_TRACE) {
        // Electron ≥32: 'console-message' passa un solo oggetto evento
        // ({ level: stringa, message, lineNumber, sourceId }) — la firma
        // posizionale (level numerico, message, line, sourceId) è deprecata.
        mainWindow.webContents.on('console-message', (e) => {
            const lvl = String(e.level || 'log').toUpperCase();
            const src = (e.sourceId || '').split('/').pop();
            console.log(`[renderer:${lvl}] ${e.message}${src ? '  (' + src + ':' + e.lineNumber + ')' : ''}`);
        });
    }

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
        const vaultDir = mapsBaseDir();   // 010: Mappe se organizzato, altrimenti MappAI - Vault

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

// Kill-switch launcher (005-landing-insegna): di default l'avvio va DIRETTO alla
// landing MappAI (il launcher di scelta MappAI/Studio era illogico per il docente).
// Lo Studio garden resta raggiungibile dal bottone "Knowledge Garden" nel menu.
// Per ripristinare il launcher storico: <userData>/mappai-settings.json con
// { "legacyLauncher": true }. Lettura SYNC + try/catch: assente/illeggibile = {}.
function legacyLauncherEnabled() {
    try {
        const p = path.join(app.getPath('userData'), 'mappai-settings.json');
        if (!fs.existsSync(p)) return false;
        const s = JSON.parse(fs.readFileSync(p, 'utf8'));
        return s && s.legacyLauncher === true;
    } catch (e) {
        return false;
    }
}

// URL del relay per la "variante WEB" delle attività QR (studenti via internet).
// Precedenza: env MAPPAI_RELAY_URL → <userData>/mappai-settings.json {"relayUrl":...}
// → default produzione. Stesso pattern SYNC+try/catch di legacyLauncherEnabled.
function relayUrlSetting() {
    if (process.env.MAPPAI_RELAY_URL) return process.env.MAPPAI_RELAY_URL;
    try {
        const p = path.join(app.getPath('userData'), 'mappai-settings.json');
        if (fs.existsSync(p)) {
            const s = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (s && typeof s.relayUrl === 'string' && s.relayUrl) return s.relayUrl;
        }
    } catch (e) { /* default */ }
    return 'wss://live.insegnai.ch';
}

// ══════════════════════════════════════════════════════════════════════════
// ORGANIZZAZIONE FILE (010) — cartella madre unica "MappAI - file"
// ---------------------------------------------------------------------------
// OPT-IN: finché `filesOrganized` !== true in mappai-settings.json TUTTI i path
// restano quelli storici (~/Documents/MappAI - *) → zero regressioni. Dopo il
// setup (posizione scelta + migrazione) tutto vive dentro <posizione>/MappAI - file/.
// I vault utente scelti a mano (pickFolder → activeVaultPath assoluto) NON sono
// toccati: qui governiamo solo le cartelle app-managed + il vault di default.
// ══════════════════════════════════════════════════════════════════════════
function settingsPath() { return path.join(app.getPath('userData'), 'mappai-settings.json'); }
function readSettings() {
    try {
        const p = settingsPath();
        if (!fs.existsSync(p)) return {};
        return JSON.parse(fs.readFileSync(p, 'utf8')) || {};
    } catch (e) { return {}; }
}
function writeSettings(patch) {
    try {
        const next = Object.assign({}, readSettings(), patch || {});
        fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
        fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2));
        return next;
    } catch (e) { console.error('[files] writeSettings', e); return readSettings(); }
}

function documentsDir() { return app.getPath('documents'); }
// Feature attiva solo dopo il setup (posizione scelta + flag esplicito).
function filesOrganized() {
    const s = readSettings();
    return s.filesOrganized === true && typeof s.filesRoot === 'string' && !!s.filesRoot;
}
// Cartella madre "MappAI - file" (sotto la posizione scelta, o Documents di default).
function mappaiRootDir() {
    const s = readSettings();
    return path.join((filesOrganized() ? s.filesRoot : documentsDir()), FilesCore.ROOT_FOLDER);
}
function subDir(kind) { return path.join(mappaiRootDir(), FilesCore.SUB[kind]); }

// Base-dir per tipo: nuova struttura se organizzata, altrimenti cartella storica.
function mapsBaseDir()     { return filesOrganized() ? subDir('maps')     : path.join(documentsDir(), 'MappAI - Vault'); }
function sharedBaseDir()   { return filesOrganized() ? subDir('shared')   : path.join(documentsDir(), 'MappAI - Materiali docente'); }
function classesBaseDir()  { return filesOrganized() ? subDir('classes')  : path.join(documentsDir(), 'MappAI - Classi'); }
function gardensBaseDir()  { return filesOrganized() ? subDir('gardens')  : path.join(documentsDir(), 'MappAI - Knowledge Garden'); }
function activityBaseDir() { return subDir('activity'); } // usata solo in modalità organizzata
// Allievi (2/8): la tessera di accesso di ogni allievo. Nessuna cartella
// storica da migrare — chi ha già organizzato i file non ce l'ha, quindi si
// crea alla prima scrittura (class-doc-save), non al setup.
function studentsBaseDir() { return filesOrganized() ? subDir('students') : path.join(documentsDir(), 'MappAI - Allievi'); }

// Cartella di UNA sessione di studio (live/tutor/lavagna).
//   organizzata → Attività di studio/<Classe>/<AAAA-MM-GG · Attività · Mappa (— ramo)>
//   storica     → <base legacy>/<slug flat storico>  (invariato → resume compatibile)
function studySessionDir(o) {
    o = o || {};
    if (filesOrganized()) {
        const segs = FilesCore.sessionRelPath({ className: o.className, activity: o.activity, map: o.name, scope: o.scope, date: Date.now() });
        return path.join(mappaiRootDir(), ...segs);
    }
    return path.join(documentsDir(), o.legacyBase, o.legacySlug);
}

function bootPrimaryWindow() {
    if (legacyLauncherEnabled()) createLauncherWindow();
    else createWindow();
}

app.whenReady().then(() => {
    initDefaultVaultFolder();
    bootPrimaryWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            bootPrimaryWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ── Helper AI condiviso (007) ──────────────────────────────────────────────
// Chiamata provider SENZA side-effect: usata dagli IPC generate-* (below,
// comportamento invariato) e dal tutor-server in-process (la chiave API resta
// confinata al main — mai serializzata verso i telefoni).
async function callGemini({ apiKey, payload, model }) {
    const modelName = model || "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    // Rimuove i marker interni (chiavi con prefisso "_", es. _respectTemp usato dal bridge
    // Infomaniak) dal generationConfig: l'API Gemini rifiuta i campi sconosciuti (400).
    if (payload && payload.generationConfig && Object.keys(payload.generationConfig).some(k => k[0] === '_')) {
        const gc = {};
        for (const k of Object.keys(payload.generationConfig)) { if (k[0] !== '_') gc[k] = payload.generationConfig[k]; }
        payload = Object.assign({}, payload, { generationConfig: gc });
    }
    try {
        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 600000 // 10 minutes timeout for complex maps
        });
        return response.data;
    } catch (error) {
        let errorMsg = error.message;
        if (error.response && error.response.data) {
            errorMsg = JSON.stringify(error.response.data);
        }
        const err = new Error(errorMsg);
        err.status = error.response && error.response.status;
        throw err;
    }
}

async function callModel({ provider, apiKey, payload, model, productId }) {
    if (provider === 'infomaniak') return callInfomaniakChat({ apiKey, payload, productId });
    return callGemini({ apiKey, payload, model });
}

// IPC handler for proxying Gemini requests
ipcMain.handle('generate-gemini', async (event, { apiKey, payload, model }) => {
    const statusPath = path.join(__dirname, '.gemini_status.json');
    const updateStatus = (data) => {
        try { fs.writeFileSync(statusPath, JSON.stringify({ ...data, timestamp: Date.now() })); } catch(e) {}
    };

    const modelName = model || "gemini-2.0-flash";
    updateStatus({ state: 'started', model: modelName, message: 'Richiesta inviata a Google...' });

    try {
        const data = await callGemini({ apiKey, payload, model });
        updateStatus({ state: 'completed' });
        return data;
    } catch (error) {
        updateStatus({ state: 'error', message: error.message });
        throw new Error(error.message);
    }
});

// Chiamata Infomaniak (stream SSE obbligatorio per bypassare il Gateway Timeout).
// Estratta dall'IPC per essere riusata dal tutor-server (007).
async function callInfomaniakChat({ apiKey, payload, productId }) {
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
        const err = new Error(errorMsg);
        err.status = error.response && error.response.status;
        throw err;
    }
}

// IPC handler for proxying Infomaniak requests (delega a callInfomaniakChat)
ipcMain.handle('generate-infomaniak', async (event, { apiKey, payload, productId }) => {
    return callInfomaniakChat({ apiKey, payload, productId });
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

// IPC handler per embeddings Google (default: gemini-embedding-001).
// Endpoint: batchEmbedContents (fino a 100 richieste per chiamata).
ipcMain.handle('generate-embeddings-google', async (event, { apiKey, model, texts }) => {
    const modelName = model || 'gemini-embedding-001';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:batchEmbedContents?key=${apiKey}`;
    const payload = {
        requests: (Array.isArray(texts) ? texts : [String(texts || '')]).map(t => ({
            model: `models/${modelName}`,
            content: { parts: [{ text: String(t || '') }] },
            taskType: 'SEMANTIC_SIMILARITY',
            outputDimensionality: 768
        }))
    };
    try {
        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });
        const data = response.data || {};
        const embeddings = (data.embeddings || []).map(item => item.values);
        return {
            embeddings,
            model: modelName,
            usage: null
        };
    } catch (error) {
        const msg = error.response?.data?.error?.message || error.message;
        const code = error.response?.status || 'N/A';
        throw new Error(`Google Embeddings Error (${code}): ${msg}`);
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

// ===================== NPC LLM locale (node-llama-cpp) =====================
// Stato del servizio: modello caricato?, RAM libera, sessioni attive.
ipcMain.handle('npc-model-status', async () => {
    try { return { success: true, ...npcLlm.status() }; }
    catch (err) { return { success: false, error: err.message }; }
});

// Genera la storia di priming o continua il dialogo con un NPC.
// stream=true → invia i token man mano sul canale 'npc-token' (typewriter).
ipcMain.handle('generate-local-npc', async (event, { npcId, systemPrompt, userText, modelPath, temperature, maxTokens, requestId, stream }) => {
    try {
        await npcLlm.ensureLoaded(modelPath);
        const onChunk = stream
            ? (token) => { try { event.sender.send('npc-token', { npcId, requestId, token }); } catch (e) { /* renderer chiuso */ } }
            : null;
        const text = await npcLlm.prompt({ npcId, systemPrompt, userText, temperature, maxTokens }, onChunk);
        return { success: true, text };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// Resetta la conversazione di un NPC (es. al cambio mappa).
ipcMain.handle('npc-reset', async (event, { npcId }) => {
    try { await npcLlm.resetNpc(npcId); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
});

// AZIONE strutturata (JSON-schema vincolato) per NPC che agiscono nel dungeon.
ipcMain.handle('generate-local-npc-action', async (event, { npcId, systemPrompt, userText, schema, modelPath, temperature, maxTokens }) => {
    try {
        await npcLlm.ensureLoaded(modelPath);
        const data = await npcLlm.promptStructured({ npcId, systemPrompt, userText, schema, temperature, maxTokens });
        return { success: true, data };
    } catch (err) { return { success: false, error: err.message }; }
});

// Cartella dei modelli GGUF in userData.
function _npcModelsDir() {
    const dir = path.join(app.getPath('userData'), 'models');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

ipcMain.handle('npc-models-dir', async () => {
    try { return { success: true, dir: _npcModelsDir() }; }
    catch (err) { return { success: false, error: err.message }; }
});

// Elenca i GGUF già scaricati in userData/models.
ipcMain.handle('npc-list-local-models', async () => {
    try {
        const dir = _npcModelsDir();
        const models = fs.readdirSync(dir)
            .filter(f => f.toLowerCase().endsWith('.gguf'))
            .map(f => {
                const p = path.join(dir, f);
                const st = fs.statSync(p);
                return { fileName: f, path: p, sizeMB: Math.round(st.size / 1e6) };
            });
        return { success: true, models };
    } catch (err) { return { success: false, error: err.message }; }
});

// Elimina un GGUF scaricato. Sicurezza: solo file dentro userData/models e solo .gguf.
ipcMain.handle('npc-delete-model', async (event, { path: filePath }) => {
    try {
        if (!filePath) throw new Error('Percorso mancante');
        const dir = path.resolve(_npcModelsDir());
        const resolved = path.resolve(filePath);
        if (resolved !== dir && !resolved.startsWith(dir + path.sep)) throw new Error('Percorso fuori dalla cartella modelli');
        if (!resolved.toLowerCase().endsWith('.gguf')) throw new Error('Non è un file .gguf');
        if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
});

// Scarica un GGUF da URL in userData/models, con progresso su 'npc-download-progress'.
ipcMain.handle('npc-download-model', async (event, { url, fileName, modelId }) => {
    try {
        if (!url || !fileName) throw new Error('URL o fileName mancante');
        const dir = _npcModelsDir();
        const dest = path.join(dir, fileName);
        const tmp = dest + '.part';
        const response = await axios({ method: 'get', url, responseType: 'stream', maxRedirects: 5 });
        const total = parseInt(response.headers['content-length'] || '0', 10);
        let received = 0, lastEmit = 0;
        const writer = fs.createWriteStream(tmp);
        response.data.on('data', (chunk) => {
            received += chunk.length;
            const now = Date.now();
            if (now - lastEmit > 250) { // throttle progressi
                lastEmit = now;
                try { event.sender.send('npc-download-progress', { modelId, received, total, pct: total ? Math.round(received / total * 100) : null }); } catch (e) { /* renderer chiuso */ }
            }
        });
        await new Promise((resolve, reject) => {
            response.data.pipe(writer);
            writer.on('finish', resolve);
            writer.on('error', reject);
            response.data.on('error', reject);
        });
        fs.renameSync(tmp, dest);
        try { event.sender.send('npc-download-progress', { modelId, received: total || received, total, pct: 100, done: true }); } catch (e) { /* noop */ }
        return { success: true, path: dest };
    } catch (err) { return { success: false, error: err.message }; }
});

// Libera il modello alla chiusura dell'app (best-effort).
app.on('before-quit', () => { try { npcLlm.dispose(); } catch (e) { /* noop */ } });

// Capture current window content as image
ipcMain.handle('capture-page', async () => {
    if (!mainWindow) return null;
    const image = await mainWindow.capturePage();
    return image.toDataURL();
});

// IPC Handler to save JSON automatically
ipcMain.handle('save-map-json', async (event, mapData) => {
    try {
        const saveDir = mapsBaseDir();   // 010
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
            destDir = mapsBaseDir();   // 010
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

// ── Pipeline «Genera materiali» (011) — 3 handler sottili (I/O + finestra) ──
// Nessuna logica di dominio qui: naming/sanitizzazione/manifest vivono nei moduli
// renderer e in FilesCore/PipelineCore (constitution VI).

// html-to-pdf: HTML stampabile → PDF senza interazione (webContents.printToPDF).
ipcMain.handle('html-to-pdf', async (event, { html, options } = {}) => {
    let win = null;
    try {
        if (!html || typeof html !== 'string') return { ok: false, error: 'html mancante' };
        const opts = options || {};
        win = new BrowserWindow({
            show: false,
            webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
        });
        await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        /* Si aspetta che i FONT siano davvero pronti, non un tempo a caso: i
           150ms fissi bastavano al layout inline ma non a scaricare un webfont,
           e le emoji delle tessere uscivano in stile di sistema invece che
           Noto/Android (2/8). Tetto a 4s: se la rete non c'è si stampa comunque
           col ripiego, invece di restare appesi. */
        await win.webContents.executeJavaScript(
            'Promise.race([' +
            '  document.fonts ? document.fonts.ready : Promise.resolve(),' +
            '  new Promise(function(r){ setTimeout(r, 4000); })' +
            ']).then(function(){ return true; })'
        ).catch(() => { });
        await new Promise(r => setTimeout(r, 150));   // settle del layout (immagini inline)
        const pdf = await win.webContents.printToPDF({
            pageSize: opts.pageSize || 'A4',
            printBackground: true,
            landscape: !!opts.landscape
        });
        return { ok: true, base64: pdf.toString('base64') };
    } catch (err) {
        return { ok: false, error: err.message };
    } finally {
        if (win) { try { win.destroy(); } catch (e) { /* noop */ } }
    }
});

// save-vault-file: scrittura generica dentro il vault (HTML/MP3/PDF/JSON manifest).
// La sanitizzazione del percorso arriva da FilesCore — main NON reimplementa regole.
ipcMain.handle('save-vault-file', async (event, { vaultPath, relPath, base64, text, ifAbsent } = {}) => {
    try {
        if (!vaultPath || !fs.existsSync(vaultPath)) return { ok: false, error: 'vault inesistente' };
        const safe = FilesCore.sanitizeVaultRelPath(relPath);
        if (!safe) return { ok: false, error: 'percorso non valido: ' + relPath };
        if (base64 == null && text == null) return { ok: false, error: 'nessun contenuto' };
        const dest = path.join(vaultPath, safe);
        // ifAbsent: non sovrascrivere (Fonti/ — il chiamante ritenta con suffisso)
        if (ifAbsent && fs.existsSync(dest)) return { ok: false, error: 'exists', exists: true };
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        if (base64 != null) {
            const b = (/^data:/i.test(base64) && base64.indexOf(',') >= 0) ? base64.slice(base64.indexOf(',') + 1) : base64;
            fs.writeFileSync(dest, Buffer.from(b, 'base64'));
        } else {
            fs.writeFileSync(dest, String(text), 'utf-8');
        }
        return { ok: true, path: dest };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

// read-vault-file: lettura simmetrica di save-vault-file (stesse guardie di path
// via FilesCore — 22/7/26, anteprima PDF originali in ELABORA). Ritorna base64.
ipcMain.handle('read-vault-file', async (event, { vaultPath, relPath } = {}) => {
    try {
        if (!vaultPath || !fs.existsSync(vaultPath)) return { ok: false, error: 'vault inesistente' };
        const safe = FilesCore.sanitizeVaultRelPath(relPath);
        if (!safe) return { ok: false, error: 'percorso non valido: ' + relPath };
        const src = path.join(vaultPath, safe);
        if (!fs.existsSync(src)) return { ok: false, error: 'file non trovato: ' + safe };
        const stat = fs.statSync(src);
        const MAX = 50 * 1024 * 1024; // cap 50MB: evita payload IPC enormi
        if (stat.size > MAX) return { ok: false, error: 'file troppo grande (' + Math.round(stat.size / 1048576) + 'MB)' };
        return { ok: true, base64: fs.readFileSync(src).toString('base64'), size: stat.size };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

// pipeline-open-folder: apre nel Finder una cartella vault DENTRO mapsBaseDir
// (i vault della pipeline sono annidati nei contenitori di classe → basename non basta).
ipcMain.handle('pipeline-open-folder', async (event, { folderPath } = {}) => {
    try {
        if (!folderPath) return { ok: false, error: 'percorso mancante' };
        const base = mapsBaseDir();
        const resolved = path.resolve(folderPath);
        if (resolved !== path.resolve(base) && !resolved.startsWith(path.resolve(base) + path.sep)) {
            return { ok: false, error: 'fuori da Mappe' };
        }
        if (!fs.existsSync(resolved)) return { ok: false, error: 'cartella-non-trovata' };
        await shell.openPath(resolved);
        return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
});

// delete-vault-file: sposta nel Cestino UN FILE dentro un vault (2/8/26).
// Mancava: «Elimina» sui materiali toglieva la voce dall'archivio in localStorage
// e lasciava il file nella cartella, e i materiali letti DAL DISCO non avevano
// affatto un comando per toglierli. Stesse guardie di save/read-vault-file
// (FilesCore.sanitizeVaultRelPath) più il vincolo che il vault stia sotto Mappe,
// e shell.trashItem come `delete-vault`: recuperabile, mai cancellazione dura.
ipcMain.handle('delete-vault-file', async (event, { vaultPath, relPath } = {}) => {
    try {
        if (!vaultPath || !fs.existsSync(vaultPath)) return { ok: false, error: 'vault inesistente' };
        const base = path.resolve(mapsBaseDir());
        const vault = path.resolve(vaultPath);
        if (vault !== base && !vault.startsWith(base + path.sep)) return { ok: false, error: 'fuori da Mappe' };
        const safe = FilesCore.sanitizeVaultRelPath(relPath);
        if (!safe) return { ok: false, error: 'percorso non valido: ' + relPath };
        const target = path.join(vault, safe);
        if (!fs.existsSync(target)) return { ok: false, error: 'file-non-trovato', missing: true };
        if (fs.statSync(target).isDirectory()) return { ok: false, error: 'è una cartella, non un file' };
        await shell.trashItem(target);
        return { ok: true, path: target };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

/* vault-file-download: SCARICA una copia di un materiale del vault, chiedendo
   all'utente nome e posizione (11/8/26).
   ⚠️ Chiede, non indovina. La prima idea era «copia in ~/Downloads»: un percorso
   scelto da noi, che su una macchina configurata diversamente è il posto
   sbagliato, e che non permette di rinominare il file mentre lo si salva — cioè
   proprio ciò che serve quando lo si sta per allegare a una mail. Il dialogo di
   sistema fa entrambe le cose ed è l'unico posto in cui l'utente può dire di no.
   Le guardie sono le STESSE di `delete-vault-file`, non una loro variante: il
   percorso va risolto e verificato sotto `Mappe`, o da qui si leggerebbe un file
   qualunque del disco passando un `relPath` costruito ad arte. */
ipcMain.handle('vault-file-download', async (event, { vaultPath, relPath } = {}) => {
    try {
        if (!vaultPath || !fs.existsSync(vaultPath)) return { ok: false, error: 'vault inesistente' };
        const base = path.resolve(mapsBaseDir());
        const vault = path.resolve(vaultPath);
        if (vault !== base && !vault.startsWith(base + path.sep)) return { ok: false, error: 'fuori da Mappe' };
        const safe = FilesCore.sanitizeVaultRelPath(relPath);
        if (!safe) return { ok: false, error: 'percorso non valido: ' + relPath };
        const sorgente = path.join(vault, safe);
        if (!fs.existsSync(sorgente)) return { ok: false, error: 'file-non-trovato', missing: true };
        if (fs.statSync(sorgente).isDirectory()) return { ok: false, error: 'è una cartella, non un file' };

        const win = BrowserWindow.fromWebContents(event.sender);
        const r = await dialog.showSaveDialog(win, {
            title: 'Scarica una copia',
            defaultPath: path.join(app.getPath('downloads'), path.basename(safe)),
            buttonLabel: 'Scarica'
        });
        /* Annullare non è un errore: è una risposta. Chi chiama non deve
           mostrare un avviso rosso perché l'utente ha cambiato idea. */
        if (r.canceled || !r.filePath) return { ok: true, annullato: true };
        fs.copyFileSync(sorgente, r.filePath);
        return { ok: true, path: r.filePath };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

/* vault-file-print: apre il DIALOGO DI STAMPA di sistema su un materiale del
   vault (11/8/26).
   ⚠️ Perché serve un IPC e non basta `iframe.print()`: dentro l'app un PDF vive
   in un iframe a origine opaca, `contentWindow.print()` lancia SecurityError e
   il bottone non fa niente senza dirlo — è il difetto già annotato in
   `stampaIframe`, che infatti su un PDF torna `false`. Qui il file si apre in
   una finestra vera (nascosta) e si stampa di là.
   Il RIPIEGO è dichiarato e non silenzioso: se la stampa non parte si apre il
   file nell'applicazione di sistema, dove il docente stampa a mano — e chi
   chiama lo sa (`aperto: true`), così può dirlo invece di far finta.
   Guardie identiche a `delete-vault-file`: percorso risolto e verificato sotto
   `Mappe`, mai una loro variante. */
ipcMain.handle('vault-file-print', async (event, { vaultPath, relPath } = {}) => {
    let win = null;
    try {
        if (!vaultPath || !fs.existsSync(vaultPath)) return { ok: false, error: 'vault inesistente' };
        const base = path.resolve(mapsBaseDir());
        const vault = path.resolve(vaultPath);
        if (vault !== base && !vault.startsWith(base + path.sep)) return { ok: false, error: 'fuori da Mappe' };
        const safe = FilesCore.sanitizeVaultRelPath(relPath);
        if (!safe) return { ok: false, error: 'percorso non valido: ' + relPath };
        const file = path.join(vault, safe);
        if (!fs.existsSync(file)) return { ok: false, error: 'file-non-trovato', missing: true };
        if (fs.statSync(file).isDirectory()) return { ok: false, error: 'è una cartella, non un file' };

        const padre = BrowserWindow.fromWebContents(event.sender);
        win = new BrowserWindow({
            show: false, parent: padre || undefined,
            webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, plugins: true }
        });
        await win.loadFile(file);
        /* i font e il visore PDF arrivano dopo il primo disegno: senza questa
           attesa si stampa una pagina bianca */
        await new Promise(r => setTimeout(r, 400));
        const stampato = await new Promise((risolvi) => {
            try {
                win.webContents.print({ silent: false, printBackground: true }, (ok) => risolvi(!!ok));
            } catch (e) { risolvi(false); }
        });
        if (stampato) return { ok: true };
        await shell.openPath(file);
        return { ok: true, aperto: true };
    } catch (err) {
        try { if (relPath && vaultPath) await shell.openPath(path.join(vaultPath, relPath)); } catch (e) { /* noop */ }
        return { ok: false, error: err.message };
    } finally {
        /* ⚠️ la finestra si chiude DOPO: distruggerla subito annullerebbe la
           stampa che l'utente ha appena confermato. `print` ha già richiamato
           il suo callback, quindi qui il lavoro è finito. */
        if (win) { try { win.destroy(); } catch (e) { /* noop */ } }
    }
});

// delete-vault: sposta nel Cestino una cartella vault DENTRO mapsBaseDir (Elimina
// dalla sezione Insegna). shell.trashItem = recuperabile (mai cancellazione dura);
// validazione sotto Mappe + rifiuto della radice stessa.
ipcMain.handle('delete-vault', async (event, { folderPath } = {}) => {
    try {
        if (!folderPath) return { success: false, error: 'percorso mancante' };
        const base = path.resolve(mapsBaseDir());
        const resolved = path.resolve(folderPath);
        if (resolved === base || (!resolved.startsWith(base + path.sep))) {
            return { success: false, error: 'fuori da Mappe' };
        }
        if (!fs.existsSync(resolved)) return { success: false, error: 'cartella-non-trovata' };
        await shell.trashItem(resolved);
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
});

// vault-relocate (29/7): sposta una cartella vault sotto un'altra coppia
// (classe, disciplina) dentro Mappe — è così che l'assegnazione a posteriori da
// ELABORA diventa vera: la CARTELLA resta la fonte di verità, non un campo in
// localStorage che le contraddice. Il nesting lo decide FilesCore.mapVaultParents;
// qui solo I/O. Collisione di nome → suffisso « · 0N » (stessa regola dell'auto-vault).
// Le cartelle-genitore rimaste vuote vengono rimosse: nessun contenitore fantasma.
ipcMain.handle('vault-relocate', async (event, { folderPath, classDir, discDir } = {}) => {
    try {
        if (!folderPath) return { success: false, error: 'percorso mancante' };
        const base = path.resolve(mapsBaseDir());
        const from = path.resolve(folderPath);
        if (from === base || !from.startsWith(base + path.sep)) return { success: false, error: 'fuori da Mappe' };
        if (!fs.existsSync(from)) return { success: false, error: 'cartella-non-trovata' };

        const parents = FilesCore.mapVaultParents(classDir || '', discDir || '');
        const destDir = path.join(base, ...parents);
        const folderName = path.basename(from);

        // Già al posto giusto → non toccare nulla (idempotente).
        if (path.resolve(path.join(destDir, folderName)) === from) {
            return { success: true, fullPath: from, folderName: folderName, classDir: classDir || null, discDir: discDir || null, moved: false };
        }

        fs.mkdirSync(destDir, { recursive: true });
        let finalName = folderName;
        if (fs.existsSync(path.join(destDir, finalName))) {
            const siblings = fs.readdirSync(destDir);
            const seq = FilesCore.sessionSeq(siblings, folderName, ' · ');
            finalName = folderName + ' · ' + String(Math.max(2, (seq.maxSeq || 0) + 1)).padStart(2, '0');
        }
        const to = path.join(destDir, finalName);
        try {
            fs.renameSync(from, to);
        } catch (e) {
            // EXDEV (volumi diversi) → copia + rimozione, come nella migrazione 010.
            if (e.code !== 'EXDEV') throw e;
            fs.cpSync(from, to, { recursive: true });
            fs.rmSync(from, { recursive: true, force: true });
        }

        // Ripulisci i contenitori rimasti vuoti risalendo fino a Mappe (mai la radice).
        let up = path.dirname(from);
        while (up !== base && up.startsWith(base + path.sep)) {
            let left; try { left = fs.readdirSync(up); } catch (e2) { break; }
            if (left.filter(n => n !== '.DS_Store').length) break;
            try { fs.rmSync(up, { recursive: true, force: true }); } catch (e2) { break; }
            up = path.dirname(up);
        }
        return { success: true, fullPath: to, folderName: finalName, classDir: classDir || null, discDir: discDir || null, moved: true };
    } catch (err) {
        console.error('vault-relocate:', err);
        return { success: false, error: err.message };
    }
});

// pipeline-open-file: apre nel programma di sistema un file dentro un vault di Mappe
// (materiali della pipeline dalla sezione Insegna). Validazione sotto mapsBaseDir.
ipcMain.handle('pipeline-open-file', async (event, { vaultPath, relPath } = {}) => {
    try {
        if (!vaultPath || !relPath) return { ok: false, error: 'parametri mancanti' };
        const safe = FilesCore.sanitizeVaultRelPath(relPath);
        if (!safe) return { ok: false, error: 'percorso non valido' };
        const base = path.resolve(mapsBaseDir());
        const target = path.resolve(path.join(vaultPath, safe));
        if (target !== base && !target.startsWith(base + path.sep)) return { ok: false, error: 'fuori da Mappe' };
        if (!fs.existsSync(target)) return { ok: false, error: 'file-non-trovato' };
        await shell.openPath(target);
        return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
});

// vault-materials-list: elenca i materiali su disco (Materiale Studio/) + manifest.
ipcMain.handle('vault-materials-list', async (event, { vaultPath } = {}) => {
    try {
        if (!vaultPath || !fs.existsSync(vaultPath)) return { ok: false, error: 'vault inesistente' };
        let manifest = null;
        try {
            const mp = path.join(vaultPath, 'pipeline.json');
            if (fs.existsSync(mp)) manifest = JSON.parse(fs.readFileSync(mp, 'utf-8'));
        } catch (e) { manifest = null; }   // parse tollerante: manifest corrotto ≠ errore
        const dir = path.join(vaultPath, 'Materiale Studio');
        const files = [];
        if (fs.existsSync(dir)) {
            fs.readdirSync(dir).forEach(name => {
                if (name.charAt(0) === '.') return;   // .DS_Store & co.: non sono materiali
                try {
                    const fp = path.join(dir, name);
                    const st = fs.statSync(fp);
                    if (st.isFile()) files.push({ name: name, relPath: 'Materiale Studio/' + name, size: st.size, mtime: st.mtimeMs });
                } catch (e) { /* skip */ }
            });
        }
        return { ok: true, manifest: manifest, files: files };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

/* vault-sources-list: elenca la cartella `Fonti/` del vault — gli ORIGINALI delle
   fonti (i PDF) e i testi estratti che le accompagnano.
   Perché serve (9/8): riaprendo una mappa dal disco, `appState.sources` restava
   vuoto e ELABORA non aveva niente da mostrare — copertura, evidenziazione,
   «Domande scheda» e i due export lavorano tutti sulla fonte. Il PDF era già lì
   (lo scrive `flushSourcesToVault`), ma nessuno sapeva CHE COSA ci fosse dentro
   quella cartella: `vault-materials-list` guarda «Materiale Studio», non `Fonti`.
   Sola lettura, nessuna ricorsione: la cartella è piatta per contratto. */
ipcMain.handle('vault-sources-list', async (event, { vaultPath } = {}) => {
    try {
        if (!vaultPath || !fs.existsSync(vaultPath)) return { ok: false, error: 'vault inesistente' };
        const dir = path.join(vaultPath, 'Fonti');
        const files = [];
        if (fs.existsSync(dir)) {
            fs.readdirSync(dir).forEach(name => {
                if (name.charAt(0) === '.') return;               // .DS_Store & co.
                try {
                    const fp = path.join(dir, name);
                    const st = fs.statSync(fp);
                    if (st.isFile()) files.push({
                        name: name, relPath: 'Fonti/' + name, size: st.size, mtime: st.mtimeMs,
                        ext: (path.extname(name) || '').replace('.', '').toLowerCase()
                    });
                } catch (e) { /* file illeggibile: si salta, non è un errore della lista */ }
            });
        }
        return { ok: true, files: files };
    } catch (err) {
        return { ok: false, error: err.message };
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
            chatDir = path.join(mapsBaseDir(), targetSubFolder);   // 010
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
            quizDir = path.join(mapsBaseDir(), 'Quiz e Flashcard');   // 010
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

// IPC Handler: Studio Attivo — salva storico score (markdown per giorno) + JSONL meta-analisi
ipcMain.handle('save-study-record', async (event, { vaultPath, dateStr, markdownLine, jsonRecord }) => {
    try {
        let dir;
        if (vaultPath && fs.existsSync(vaultPath)) {
            dir = path.join(vaultPath, 'Studio Attivo');
        } else {
            dir = path.join(mapsBaseDir(), 'Studio Attivo');   // 010
        }
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // 1) Storico leggibile, raggruppato per giorno
        const mdPath = path.join(dir, 'storico_score.md');
        let md = fs.existsSync(mdPath)
            ? fs.readFileSync(mdPath, 'utf-8')
            : '# Studio Attivo — Storico Score\n\n> Registro automatico delle sessioni di studio attivo.\n> Dati destinati a meta-analisi e neuro-feedback sui vault degli studenti.\n';
        const dayHeader = `\n## ${dateStr}\n`;
        if (!md.includes(dayHeader)) md += dayHeader;
        md += markdownLine.endsWith('\n') ? markdownLine : markdownLine + '\n';
        fs.writeFileSync(mdPath, md, 'utf-8');

        // 2) Dati strutturati append-only (una sessione per riga)
        const jsonlPath = path.join(dir, 'sessioni.jsonl');
        fs.appendFileSync(jsonlPath, JSON.stringify(jsonRecord) + '\n', 'utf-8');

        return { success: true, path: mdPath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// ==========================================
// DATA ABSTRACTION LAYER (DAL) - MARKDOWN VAULT
// ==========================================

// === Sottocartelle per ramo dentro Nodi/ (gated da mapData.branchFolders) ===
// Layout JIGSAW: un ramo L1 = una cartella. Reversibile: flag OFF → layout piatto.
function _vaultSafeSeg(s) {
    return String(s || '').replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 40) || 'x';
}
// Cartella ramo per un nodo MindMap: risale la catena parent fino all'L1 (level 1).
// '' = scrivi nella radice Nodi/ (piatto). '_root' per il nodo radice/orfani.
function _vaultBranchFolder(node, nodesById) {
    if (!node) return '';
    if (node.level === 0) return '_root';
    let cur = node, guard = 0;
    while (cur && cur.level > 1 && cur.parent && guard < 64) {
        cur = nodesById[cur.parent];
        guard++;
    }
    if (!cur || cur.level !== 1) return '_root';
    return `g${cur.group != null ? cur.group : 0}_${_vaultSafeSeg(cur.label)}`;
}
// Walk ricorsivo: lista di path assoluti .md sotto dir (qualsiasi profondità).
function _vaultWalkMd(dir) {
    const out = [];
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
    for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) out.push(..._vaultWalkMd(full));
        else if (ent.name.endsWith('.md')) out.push(full);
    }
    return out;
}
// Rimuove ricorsivamente le sottocartelle vuote sotto dir (non dir stessa).
function _vaultPruneEmptyDirs(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const sub = path.join(dir, ent.name);
        _vaultPruneEmptyDirs(sub);
        try { if (fs.readdirSync(sub).length === 0) fs.rmdirSync(sub); } catch (e) {}
    }
}

ipcMain.handle('save-vault', async (event, { folderPath, mapData }) => {
    try {
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
        
        // 1. Save index.yaml (Global Map Config) — serializzato con js-yaml
        const indexData = {
            extractionMode: mapData.extractionMode,
            rootNodeLabel: mapData.rootNodeLabel,
            /* CLASSE e MATERIA dichiarate DENTRO il vault (9/8): finora vivevano
               solo nei nomi delle cartelle e nel progetto in localStorage, cioè in
               due posti che non viaggiano con la cartella. Un vault passato a un
               collega deve almeno sapere di che disciplina parla. */
            classe: mapData.classe || '',
            materia: mapData.materia || '',
            userProfile: mapData.userProfile || null,
            customColors: mapData.customColors || {},
            generationUsage: mapData.generationUsage || null,
            lastUpdated: new Date().toISOString()
        };
        const indexYaml = yaml.dump(indexData, { lineWidth: -1, quotingType: '"', forceQuotes: false });
        fs.writeFileSync(path.join(folderPath, 'index.yaml'), indexYaml, 'utf-8');

        // 2. Save Links (Relationship index) — i PONTI JIGSAW vanno isolati in Nodi/_ponti/_bridges.json
        const _mapLink = l => ({
            source: typeof l.source === 'object' ? l.source.id : l.source,
            target: typeof l.target === 'object' ? l.target.id : l.target,
            rel: l.rel || "",
            isCross: !!l.isCross
        });
        const _bridgesData = (mapData.links || []).filter(l => l.isBridge).map(l => Object.assign(_mapLink(l), {
            isBridge: true,
            bridgeStatus: l.bridgeStatus || 'proposed',
            bridgeAuthor: l.bridgeAuthor || '',
            justification: l.justification || ''
        }));
        const linksData = (mapData.links || []).filter(l => !l.isBridge).map(_mapLink);
        fs.writeFileSync(path.join(folderPath, 'links.json'), JSON.stringify(linksData, null, 2), 'utf-8');

        // 3. Save Nodes & Allegati directory (Updated)
        const nodesDir = path.join(folderPath, 'Nodi');
        const allegatiDir = path.join(folderPath, 'Allegati');
        if (!fs.existsSync(nodesDir)) fs.mkdirSync(nodesDir, { recursive: true });
        if (!fs.existsSync(allegatiDir)) fs.mkdirSync(allegatiDir, { recursive: true });

        // 3b. Ponti JIGSAW isolati (contributi inter-area dello studente)
        const _pontiBridgesPath = path.join(nodesDir, '_ponti', '_bridges.json');
        if (_bridgesData.length > 0 || fs.existsSync(_pontiBridgesPath)) {
            const _pontiDir = path.join(nodesDir, '_ponti');
            if (!fs.existsSync(_pontiDir)) fs.mkdirSync(_pontiDir, { recursive: true });
            fs.writeFileSync(_pontiBridgesPath, JSON.stringify(_bridgesData, null, 2), 'utf-8');
        }

        // Collect all links for the summary file
        const globalLinks = [];

        // === Sottocartelle per ramo (gated): mappa id→nodo + helper layout ===
        const _nodesById = {};
        (mapData.nodes || []).forEach(n => { _nodesById[n.id] = n; });
        // Deriva parent dai link quando assente: le mappe appena generate non settano
        // node.parent, e senza parent _vaultBranchFolder manda tutti gli L2+ in _root/
        // (layout per-ramo JIGSAW rotto). Il parent derivato viene poi persistito nel
        // frontmatter → i vault si auto-riparano al primo salvataggio.
        const _endpointId = v => (v && typeof v === 'object') ? v.id : v;
        (mapData.links || []).forEach(l => {
            if (l.isCross || l.isBridge) return;
            const s = _nodesById[_endpointId(l.source)], t = _nodesById[_endpointId(l.target)];
            if (s && t && !t.parent && typeof s.level === 'number' && typeof t.level === 'number' && s.level === t.level - 1) {
                t.parent = s.id;
            }
        });
        const _useBranchFolders = !!mapData.branchFolders && mapData.extractionMode !== 'kg';
        const _nodeFolder = (node) => _useBranchFolders ? _vaultBranchFolder(node, _nodesById) : '';
        const _nodeFileName = (node) => `${node.label.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${node.id}.md`;

        // 4a. Pulizia orfani + migrazione layout — chiave = PATH RELATIVO (posix), non basename.
        //     Così i vecchi file piatti vengono rimossi quando un nodo migra in sottocartella (e viceversa
        //     quando il flag viene spento), in un solo passaggio insieme agli orfani di merge/relink.
        const validRelPaths = new Set(
            (mapData.nodes || []).map(node => {
                const folder = _nodeFolder(node);
                return (folder ? folder + '/' : '') + _nodeFileName(node);
            })
        );
        try {
            _vaultWalkMd(nodesDir).forEach(abs => {
                const rel = path.relative(nodesDir, abs).split(path.sep).join('/');
                if (!validRelPaths.has(rel)) fs.unlinkSync(abs);
            });
        } catch(e) {
            console.warn('[Vault] Pulizia file orfani fallita:', e.message);
        }

        // 4b. Save each node as a Markdown file
        (mapData.nodes || []).forEach(node => {
            const safeLabel = node.label.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const fileName = `${safeLabel}_${node.id}.md`;
            const branchFolder = _nodeFolder(node);
            const nodeTargetDir = branchFolder ? path.join(nodesDir, branchFolder) : nodesDir;
            if (branchFolder && !fs.existsSync(nodeTargetDir)) fs.mkdirSync(nodeTargetDir, { recursive: true });

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
            // Stato di studio (spaced repetition): senza questi campi il semaforo
            // e la programmazione dei ripassi si perdono a ogni riapertura del vault.
            if (node.studyStatus && node.studyStatus !== 'none') frontmatter += `studyStatus: "${node.studyStatus}"\n`;
            if (node.nextReview) frontmatter += `nextReview: ${node.nextReview}\n`;
            if (node.lastReviewed) frontmatter += `lastReviewed: ${node.lastReviewed}\n`;
            
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

            fs.writeFileSync(path.join(nodeTargetDir, fileName), frontmatter + content, 'utf-8');
        });

        // 4c. Rimuovi le sottocartelle ramo rimaste vuote (rinomina L1 / flag spento)
        _vaultPruneEmptyDirs(nodesDir);

        // 5. Save Global Links Summary
        const summaryHeader = `INDICE FONTI E LINK - ${mapData.rootNodeLabel}\n`;
        const summaryTxt = summaryHeader + "=".repeat(summaryHeader.length) + "\n\n" + 
                          (globalLinks.length > 0 ? globalLinks.join('\n') : "Nessun link esterno trovato.");
        fs.writeFileSync(path.join(folderPath, 'fonti_e_link.txt'), summaryTxt, 'utf-8');

        // 6. Save Tutor Chat State
        if (mapData.tutorState) {
            fs.writeFileSync(path.join(folderPath, 'chat_state.json'), JSON.stringify(mapData.tutorState, null, 2), 'utf-8');
        }

        // 6b. Save Mastery store (padronanza per pinpoint) → Studio Attivo/mastery.json (per meta-analisi docente)
        if (mapData.masteryStore && Object.keys(mapData.masteryStore).length > 0) {
            const studioDir = path.join(folderPath, 'Studio Attivo');
            if (!fs.existsSync(studioDir)) fs.mkdirSync(studioDir, { recursive: true });
            fs.writeFileSync(path.join(studioDir, 'mastery.json'), JSON.stringify(mapData.masteryStore, null, 2), 'utf-8');
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

// JIGSAW: scrive i marker _lock.yaml per cartella ramo + garantisce _ponti/ vuota.
// locks = { 'g1_cause': {editable, owner, role, ...}, ... }. Chiamato dopo save-vault
// (con branchFolders:true) su ciascuna copia esportata dal docente.
ipcMain.handle('write-branch-locks', async (event, { folderPath, locks }) => {
    try {
        const nodesDir = path.join(folderPath, 'Nodi');
        if (!fs.existsSync(nodesDir)) return { success: false, error: 'Cartella Nodi assente' };
        Object.keys(locks || {}).forEach(branchKey => {
            const dir = path.join(nodesDir, branchKey);
            if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
                const yml = yaml.dump(locks[branchKey], { lineWidth: -1, quotingType: '"', forceQuotes: false });
                fs.writeFileSync(path.join(dir, '_lock.yaml'), yml, 'utf-8');
            }
        });
        // Cartella ponti (contributi inter-area dello studente) — sempre presente, anche vuota.
        const ponti = path.join(nodesDir, '_ponti');
        if (!fs.existsSync(ponti)) fs.mkdirSync(ponti, { recursive: true });
        return { success: true };
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
                if (parsed.classe)          mapData.classe          = parsed.classe;
                if (parsed.materia)         mapData.materia         = parsed.materia;
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
            _vaultWalkMd(nodesDir).forEach(absPath => {
                const content = fs.readFileSync(absPath, 'utf-8');
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
                        if (k === 'studyStatus') node.studyStatus = cleanV;
                        if (k === 'nextReview') node.nextReview = parseInt(cleanV);
                        if (k === 'lastReviewed') node.lastReviewed = parseInt(cleanV);
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
        // Load branch locks (JIGSAW): _lock.yaml per cartella ramo → mapData.branchLocks
        mapData.branchLocks = {};
        try {
            if (fs.existsSync(nodesDir)) {
                fs.readdirSync(nodesDir, { withFileTypes: true }).forEach(ent => {
                    if (!ent.isDirectory()) return;
                    const lp = path.join(nodesDir, ent.name, '_lock.yaml');
                    if (fs.existsSync(lp)) {
                        try { mapData.branchLocks[ent.name] = yaml.load(fs.readFileSync(lp, 'utf-8')); } catch (e) {}
                    }
                });
            }
        } catch (e) {}

        // Load JIGSAW bridges: Nodi/_ponti/_bridges.json → uniti ai link (con i marker isBridge)
        try {
            const bpath = path.join(nodesDir, '_ponti', '_bridges.json');
            if (fs.existsSync(bpath)) {
                const br = JSON.parse(fs.readFileSync(bpath, 'utf-8'));
                if (Array.isArray(br)) mapData.links = (mapData.links || []).concat(br);
            }
        } catch (e) {}

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

// META-ANALISI: elenca le sottocartelle-vault dentro un parent (le copie studenti).
ipcMain.handle('list-vault-subfolders', async (event, parentPath) => {
    try {
        if (!parentPath || !fs.existsSync(parentPath)) return { folders: [] };
        const folders = fs.readdirSync(parentPath, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => ({ name: e.name, path: path.join(parentPath, e.name) }))
            .filter(f => fs.existsSync(path.join(f.path, 'Nodi')) || fs.existsSync(path.join(f.path, 'index.yaml')));
        return { folders: folders };
    } catch (err) {
        return { folders: [], error: err.message };
    }
});

// META-ANALISI: legge Studio Attivo/sessioni.jsonl di un vault → array di record sessione.
ipcMain.handle('read-study-sessions', async (event, vaultPath) => {
    try {
        let sessions = [];
        const p = path.join(vaultPath, 'Studio Attivo', 'sessioni.jsonl');
        if (fs.existsSync(p)) {
            sessions = fs.readFileSync(p, 'utf-8').split('\n').filter(Boolean).map(line => {
                try { return JSON.parse(line); } catch (e) { return null; }
            }).filter(Boolean);
        }
        // Store di padronanza (accuratezza + fluenza per pinpoint), se esportato nel vault.
        let mastery = null;
        const mp = path.join(vaultPath, 'Studio Attivo', 'mastery.json');
        if (fs.existsSync(mp)) {
            try { mastery = JSON.parse(fs.readFileSync(mp, 'utf-8')); } catch (e) {}
        }
        return { sessions: sessions, mastery: mastery };
    } catch (err) {
        return { sessions: [], mastery: null, error: err.message };
    }
});

// MEMORY DUNGEON: piani custom dal vault (Memory Dungeon/piani/*.json + Memory Dungeon/ruleset.json).
// Contratto mappai-dungeon-floor@1 — design: docs/game-design/VAULT_DUNGEON_MAPS_CONTRACT.md
// Nome file LIBERO: il legame al piano viene dal nome `piano-N.json` se presente,
// altrimenti dal campo "id" interno ("piano-N") — così un file ricevuto da docente o
// compagno si droppa in piani/ senza doverlo rinominare. Due file per lo stesso piano
// → vince il più recente (mtime), con warning.
// Cartella assente o file rotti → si torna al procedurale (fallback nel renderer).
ipcMain.handle('load-dungeon-floors', async (event, vaultPath) => {
    try {
        if (!vaultPath) return { success: false, error: 'vaultPath mancante' };
        const dir = path.join(vaultPath, 'Memory Dungeon');
        const pianiDir = path.join(dir, 'piani');
        const out = { success: true, plans: {}, ruleset: null, materials: null };
        const rp = path.join(dir, 'ruleset.json');
        if (fs.existsSync(rp)) {
            try { out.ruleset = JSON.parse(fs.readFileSync(rp, 'utf-8')); }
            catch (e) { console.warn('Memory Dungeon/ruleset.json non valido:', e.message); }
        }
        // texture + materiali del vault (contratto: mappai-dungeon-materials@1)
        const mp = path.join(dir, 'materiali.json');
        if (fs.existsSync(mp)) {
            try { out.materials = JSON.parse(fs.readFileSync(mp, 'utf-8')); }
            catch (e) { console.warn('Memory Dungeon/materiali.json non valido:', e.message); }
        }
        // mappa-mondo (contratto §11: mappai-dungeon-world@1) — se presente e valida,
        // il gioco può partire in modalità mondo al posto della pila di piani
        const wp = path.join(dir, 'mondo.json');
        out.world = null;
        if (fs.existsSync(wp)) {
            try { out.world = JSON.parse(fs.readFileSync(wp, 'utf-8')); }
            catch (e) { console.warn('Memory Dungeon/mondo.json non valido:', e.message); }
        }
        if (fs.existsSync(pianiDir)) {
            const chosen = {};   // idx → { mtime, file }
            for (const f of fs.readdirSync(pianiDir)) {
                if (!/\.json$/i.test(f)) continue;
                const full = path.join(pianiDir, f);
                let plan;
                try { plan = JSON.parse(fs.readFileSync(full, 'utf-8')); }
                catch (e) { console.warn('Memory Dungeon/piani/' + f + ' non valido:', e.message); continue; }
                const m = f.match(/^piano-(\d+)\.json$/i) ||
                    (plan && typeof plan.id === 'string' ? plan.id.match(/^piano-(\d+)$/) : null);
                if (!m) {
                    console.warn('Memory Dungeon/piani/' + f + ': manca il legame al piano (nome piano-N.json o campo "id") — ignorato');
                    continue;
                }
                const idx = m[1];
                const mtime = fs.statSync(full).mtimeMs;
                if (chosen[idx]) {
                    const keep = chosen[idx].mtime >= mtime ? chosen[idx].file : f;
                    console.warn('Memory Dungeon/piani: piano-' + idx + ' definito da più file (' + chosen[idx].file + ', ' + f + ') — vince il più recente: ' + keep);
                    if (chosen[idx].mtime >= mtime) continue;
                }
                chosen[idx] = { mtime, file: f };
                out.plans[idx] = plan;
            }
        }
        return out;
    } catch (err) {
        console.error('Errore load-dungeon-floors:', err);
        return { success: false, error: err.message };
    }
});

// MEMORY DUNGEON STUDIO: scrive texture+materiali del vault (Memory Dungeon/materiali.json).
// Schema mappai-dungeon-materials@1 — un piano con facce testurizzate senza le sue
// texture sarebbe rotto: le librerie viaggiano col vault (e col pacchetto classe).
ipcMain.handle('save-dungeon-materials', async (event, { vaultPath, materials }) => {
    try {
        if (!vaultPath || !materials) return { success: false, error: 'vaultPath o materials mancante' };
        const dir = path.join(vaultPath, 'Memory Dungeon');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'materiali.json'), JSON.stringify(materials, null, 2), 'utf-8');
        return { success: true };
    } catch (err) {
        console.error('Errore save-dungeon-materials:', err);
        return { success: false, error: err.message };
    }
});

// MEMORY DUNGEON STUDIO: scrive il ruleset del docente (Memory Dungeon/ruleset.json).
// Form nella landing Studio (contratto §3: soglie + severità, 1 per vault).
ipcMain.handle('save-dungeon-ruleset', async (event, { vaultPath, ruleset }) => {
    try {
        if (!vaultPath || !ruleset) return { success: false, error: 'vaultPath o ruleset mancante' };
        const dir = path.join(vaultPath, 'Memory Dungeon');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'ruleset.json'), JSON.stringify(ruleset, null, 2), 'utf-8');
        return { success: true };
    } catch (err) {
        console.error('Errore save-dungeon-ruleset:', err);
        return { success: false, error: err.message };
    }
});

// MEMORY DUNGEON STUDIO: esporta un pacchetto classe (bundle multi-piano) da condividere.
// Legge i piani scelti dal vault, chiede dove salvare, scrive un file unico.
ipcMain.handle('export-dungeon-bundle', async (event, { vaultPath, ids, title, author }) => {
    try {
        if (!vaultPath || !Array.isArray(ids) || !ids.length) return { success: false, error: 'vaultPath o ids mancanti' };
        const pianiDir = path.join(vaultPath, 'Memory Dungeon', 'piani');
        const floors = [];
        for (const id of ids) {
            const p = path.join(pianiDir, 'piano-' + id + '.json');
            if (fs.existsSync(p)) floors.push(JSON.parse(fs.readFileSync(p, 'utf-8')));
        }
        if (!floors.length) return { success: false, error: 'nessun piano trovato' };
        const bundle = {
            schema: 'mappai-dungeon-bundle@1',
            title: title || path.basename(vaultPath) + ' — pacchetto piani',
            author: author || '',
            created: new Date().toISOString().slice(0, 10),
            floors
        };
        // le texture/materiali del vault viaggiano col pacchetto (facce testurizzate)
        const bmp = path.join(vaultPath, 'Memory Dungeon', 'materiali.json');
        if (fs.existsSync(bmp)) {
            try { bundle.materials = JSON.parse(fs.readFileSync(bmp, 'utf-8')); } catch (e) { /* senza materiali */ }
        }
        const win = BrowserWindow.fromWebContents(event.sender);
        const res = await dialog.showSaveDialog(win, {
            title: 'Esporta pacchetto classe',
            defaultPath: path.join(app.getPath('documents'), (bundle.title || 'pacchetto').replace(/[/\\:]/g, '-') + '.mappai-dungeon.json'),
            filters: [{ name: 'Pacchetto Memory Dungeon', extensions: ['json'] }]
        });
        if (res.canceled || !res.filePath) return { success: false, canceled: true };
        fs.writeFileSync(res.filePath, JSON.stringify(bundle, null, 2), 'utf-8');
        return { success: true, file: res.filePath, floors: floors.length };
    } catch (err) {
        console.error('Errore export-dungeon-bundle:', err);
        return { success: false, error: err.message };
    }
});

// ============================================================
// KNOWLEDGE GARDEN (pivot 10/7/26) — sessione LAN dal PC docente.
// Lo Studio avvia il server (garden-server.js), gli studenti si collegano
// dal browser via QR. Archivio: ~/Documents/MappAI - Knowledge Garden/<slug>/
// ============================================================
const { createGardenServer } = require('./garden-server');
let gardenSrv = null;
let gardenInfo = null;   // { port, urls, token, dir, name }

function gardenBaseDir() {
    return gardensBaseDir();   // 010: Giardini se organizzato, altrimenti MappAI - Knowledge Garden
}
function lanUrls(port) {
    const urls = [];
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
        for (const i of ifaces[name] || []) {
            if (i.family === 'IPv4' && !i.internal) urls.push('http://' + i.address + ':' + port);
        }
    }
    if (!urls.length) urls.push('http://localhost:' + port);
    return urls;
}

// ── Variante WEB (relay Infomaniak) ─────────────────────────────────────────
// Se il renderer passa netMode:'web', la sessione viene registrata sul relay
// (relay-client.js → wss in uscita) e il QR usa l'URL pubblico https://…/j/<code>.
// Il server locale resta identico: il relay gli inoltra le richieste studente
// su 127.0.0.1. Relay irraggiungibile → fallback LAN con flag relayFallback
// (il wizard mostra un toast e la sessione parte comunque in modalità WiFi).
const relayClient = require('./relay-client');
const relayHandles = {}; // kind ('live'|'collab'|'tutor'|'materials'|'garden') → handle

function closeRelay(kind) {
    if (relayHandles[kind]) {
        try { relayHandles[kind].close(); } catch (e) { /* già chiuso */ }
        relayHandles[kind] = null;
    }
}

async function maybeRelay(kind, info, opts, activity, mode) {
    closeRelay(kind); // il restart della sessione chiude sempre il relay precedente
    if (!opts || opts.netMode !== 'web') return info;
    try {
        const h = await relayClient.openSession({
            relayUrl: relayUrlSetting(), activity,
            token: info.token, localPort: info.port, mode: mode || null
        });
        relayHandles[kind] = h;
        console.log('[relay] sessione ' + kind + ' pubblicata: ' + h.publicUrl);
        return Object.assign({}, info, {
            netMode: 'web', urls: [h.publicUrl], lanUrls: info.urls, relayCode: h.code
        });
    } catch (e) {
        console.warn('[relay] non raggiungibile (' + e.message + ') → fallback LAN per ' + kind);
        return Object.assign({}, info, { netMode: 'lan', relayFallback: true, relayError: e.message });
    }
}

// Avvia (o RIPRENDE) una sessione. Payload dal renderer Studio:
// { name, plotSize, template (map JSON), libs {textures,materials,assets} }
ipcMain.handle('garden-start-session', async (event, opts) => {
    try {
        if (gardenSrv) { await gardenSrv.stop(); gardenSrv = null; gardenInfo = null; }
        const name = (opts && opts.name) || 'Knowledge Garden';
        const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sessione';
        const dir = path.join(gardenBaseDir(), slug);
        const resuming = fs.existsSync(path.join(dir, 'session.json'));
        gardenSrv = createGardenServer({
            repoRoot: __dirname,
            dir,
            session: { name, plotSize: (opts && opts.plotSize) || 15 },
            template: opts && opts.template,
            libs: (opts && opts.libs) || {}
        });
        let port = null, lastErr = null;
        for (let p = 8765; p <= 8775; p++) {
            try { port = await gardenSrv.listen(p, '0.0.0.0'); break; }
            catch (e) { lastErr = e; }
        }
        if (!port) throw lastErr || new Error('nessuna porta libera 8765-8775');
        const st = gardenSrv.state();
        gardenInfo = {
            port, urls: lanUrls(port), token: st.session.token,
            adminToken: st.session.adminToken, dir, name, resumed: resuming
        };
        gardenInfo = await maybeRelay('garden', gardenInfo, opts, 'garden');
        console.log('[garden] sessione avviata su :' + port, resuming ? '(RIPRESA)' : '');
        return Object.assign({ success: true, plots: st.plots.length }, gardenInfo);
    } catch (err) {
        console.error('Errore garden-start-session:', err);
        gardenSrv = null;
        return { success: false, error: err.message };
    }
});

ipcMain.handle('garden-stop-session', async () => {
    try {
        closeRelay('garden');
        if (gardenSrv) { await gardenSrv.stop(); gardenSrv = null; gardenInfo = null; }
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
});

// Polling della dashboard Studio: claims + consegne
ipcMain.handle('garden-session-status', async () => {
    if (!gardenSrv) return { success: false, error: 'nessuna sessione attiva' };
    return Object.assign({ success: true }, gardenSrv.state(), {
        port: gardenInfo.port, urls: gardenInfo.urls, dir: gardenInfo.dir
    });
});

ipcMain.handle('garden-open-folder', async () => {
    const dir = gardenInfo ? gardenInfo.dir : gardenBaseDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
    return { success: true, dir };
});

// ══════════════════════════════════════════════════════════════════════════
// LAVAGNA COLLABORATIVA (003) — server LAN, stesso pattern del Knowledge Garden
// ══════════════════════════════════════════════════════════════════════════
const { createCollabServer } = require('./collab-server');
let collabSrv = null;
let collabInfo = null;

function collabBaseDir() {
    // 010: sessioni Lavagna in "Attività di studio" se organizzato, altrimenti MappAI - Lavagna.
    return filesOrganized() ? activityBaseDir() : path.join(documentsDir(), 'MappAI - Lavagna');
}

// Avvia (o RIPRENDE) una sessione lavagna. Payload dal renderer:
// { name (nome mappa), rootLabel (tema centrale) }
ipcMain.handle('collab-start-session', async (event, opts) => {
    try {
        if (collabSrv) { await collabSrv.stop(); collabSrv = null; collabInfo = null; }
        const name = (opts && opts.name) || 'Lavagna';
        const legacySlug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sessione';
        const requestedMode = (opts && opts.loginMode) === 'individual' ? 'individual' : 'group';
        // Ripresa ESPLICITA di una sessione scelta dal docente (menu «Riprendi» nel modale):
        // punta il server alla cartella indicata → ne recupera board/gruppi/QR. Prevale sul
        // naming progressivo. Il loginMode effettivo lo detta il session.json su disco.
        let dir, resuming;
        const resumeDir = opts && opts.resumeDir ? String(opts.resumeDir) : '';
        if (resumeDir && fs.existsSync(path.join(resumeDir, 'session.json'))) {
            dir = resumeDir; resuming = true;
        } else {
            // Progressivo per somministrazione (…-00, …-01, …). Crash-safe: riprende l'ultima
            // Lavagna del giorno SOLO se è ancora aperta (phase ≠ closed → "Ferma server" la
            // chiude) E la modalità login coincide con quella scelta ora. Modalità diversa o
            // sessione conclusa → nuova cartella pulita (niente più ripresa della vecchia).
            ({ dir, resuming } = progressiveSessionDir(
                { name, activity: 'lavagna', className: (opts && opts.className) || '', scope: (opts && opts.scope) || '', legacyBase: 'MappAI - Lavagna', legacySlug },
                doc => doc && doc.session && doc.session.phase !== 'closed'
                    && ((doc.session.loginMode === 'individual' ? 'individual' : 'group') === requestedMode)
            ));
        }
        fs.mkdirSync(dir, { recursive: true });
        collabSrv = createCollabServer({
            repoRoot: __dirname,
            dir,
            // Login flessibile (008 US5): loginMode/roster pass-through (default = gruppi)
            session: { name, rootLabel: (opts && opts.rootLabel) || name, loginMode: requestedMode, className: (opts && opts.className) || '', scope: (opts && opts.scope) || '' },
            roster: (opts && Array.isArray(opts.roster)) ? opts.roster : []
        });
        let port = null, lastErr = null;
        for (let p = 8766; p <= 8776; p++) {
            try { port = await collabSrv.listen(p, '0.0.0.0'); break; }
            catch (e) { lastErr = e; }
        }
        if (!port) throw lastErr || new Error('nessuna porta libera 8766-8776');
        const st = collabSrv.state();
        collabInfo = {
            port, urls: lanUrls(port), token: st.session.token,
            adminToken: st.session.adminToken, dir, name, resumed: resuming
        };
        collabInfo = await maybeRelay('collab', collabInfo, opts, 'collab');
        console.log('[collab] sessione lavagna avviata su :' + port, resuming ? '(RIPRESA)' : '');
        return Object.assign({ success: true, groups: st.groups.length }, collabInfo);
    } catch (err) {
        console.error('Errore collab-start-session:', err);
        collabSrv = null;
        return { success: false, error: err.message };
    }
});

ipcMain.handle('collab-stop-session', async () => {
    try {
        closeRelay('collab');
        // Chiusura ESPLICITA (il docente ferma il server): marca la sessione 'closed' su
        // disco → il prossimo avvio parte da una cartella progressiva nuova. Senza questo,
        // un semplice riavvio dell'app la riprenderebbe (crash-safety), riproponendo il
        // lavoro precedente. Se invece l'app crasha (nessuno stop) la sessione resta aperta
        // → ripresa voluta.
        if (collabSrv && collabSrv.markClosed) { try { collabSrv.markClosed(); } catch (e) { /* best-effort */ } }
        if (collabSrv) { await collabSrv.stop(); collabSrv = null; collabInfo = null; }
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
});

// Info sessione corrente (il polling dei gruppi lo fa il renderer
// direttamente su 127.0.0.1:<port>/api/status con l'adminToken)
ipcMain.handle('collab-session-info', async () => {
    if (!collabSrv || !collabInfo) return { success: false, error: 'nessuna sessione attiva' };
    return Object.assign({ success: true }, collabInfo);
});

ipcMain.handle('collab-open-folder', async () => {
    const dir = collabInfo ? collabInfo.dir : collabBaseDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
    return { success: true, dir };
});

// Elenca le sessioni Lavagna salvate su disco (per il menu «Riprendi» del modale).
// Cammina la base (organizzata o storica) cercando i session.json della lavagna.
ipcMain.handle('collab-sessions-list', async () => {
    try {
        const out = [];
        const walk = (root, depth) => {
            if (depth > 4) return;
            let entries = [];
            try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (e) { return; }
            const sj = path.join(root, 'session.json');
            if (entries.some(e => e.isFile() && e.name === 'session.json')) {
                try {
                    const doc = JSON.parse(fs.readFileSync(sj, 'utf8'));
                    const s = doc.session || doc;
                    if (s && (doc.schema === 'mappai-collab-session@1' || s.activity === 'lavagna')) {
                        let groupCount = Array.isArray(doc.groups) ? doc.groups.length : 0;
                        try {
                            const bp = path.join(root, 'board.json');
                            if (fs.existsSync(bp)) groupCount = (JSON.parse(fs.readFileSync(bp, 'utf8')).groups || []).length;
                        } catch (e) { /* board illeggibile → conteggio dai gruppi indice */ }
                        out.push({
                            dir: root, name: s.name || 'Lavagna', className: s.className || '',
                            loginMode: s.loginMode === 'individual' ? 'individual' : 'group',
                            phase: s.phase || 'open', startedAt: s.startedAt || null, groupCount
                        });
                    }
                } catch (e) { /* session.json illeggibile → salta */ }
                return; // cartella-sessione: niente sotto-sessioni
            }
            entries.filter(e => e.isDirectory()).forEach(e => walk(path.join(root, e.name), depth + 1));
        };
        const base = collabBaseDir();
        if (fs.existsSync(base)) walk(base, 0);
        out.sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
        return { success: true, sessions: out };
    } catch (err) { return { success: false, error: err.message, sessions: [] }; }
});

// ══════════════════════════════════════════════════════════════════════════
// MAPPAI LIVE — Studio attivo via QR + Materiali (stesso pattern LAN)
// Quiz: ~/Documents/MappAI - Live/<slug-sessione>/ · porte 8767-8777
// Materiali: sottocartella materiali-<slug>-<data>/ · porte 8768-8778
// Classi (roster credenziali): ~/Documents/MappAI - Classi/classi.json
// ══════════════════════════════════════════════════════════════════════════
const { createLiveServer, createMaterialsServer } = require('./live-server');
let liveSrv = null, liveInfo = null;
let liveMatSrv = null, liveMatInfo = null;

function liveBaseDir() { return filesOrganized() ? activityBaseDir() : path.join(documentsDir(), 'MappAI - Live'); }
function classiFile() { return path.join(classesBaseDir(), 'classi.json'); }   // 010
function slugLive(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}
function dateStamp() {
    const d = new Date(); const p = n => String(n).padStart(2, '0');
    return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear();
}

// (parent, baseName, sep) per una sessione — organizzato o storico. Riusato da tutte
// le attività LAN (live/tutor/lavagna) per il naming progressivo.
//   o = { name, activity, className, scope, legacyBase, legacySlug }
function sessionParentBase(o) {
    o = o || {};
    if (filesOrganized()) {
        const parent = path.join(mappaiRootDir(), FilesCore.SUB.activity, FilesCore.classFolder(o.className || ''));
        const baseName = FilesCore.sessionFolderName({
            className: o.className || '', activity: o.activity || 'quiz',
            map: o.name || 'Sessione', scope: o.scope || '', date: Date.now()
        });
        return { parent, baseName, sep: ' · ' };
    }
    return { parent: path.join(documentsDir(), o.legacyBase), baseName: o.legacySlug, sep: '-' };
}

// Cartella di UNA somministrazione, con suffisso progressivo (…-00, …-01, …). Più sessioni
// per la stessa classe/mappa nello stesso giorno = cartelle DISTINTE → non si ricade più
// sulla sessione (chiusa) precedente. Crash-safe: se l'ultima è ancora RIPRENDIBILE
// (canResume(doc) → true, es. phase ≠ closed) la riprende con lo stesso token/QR; altrimenti
// ne crea una nuova col numero successivo. La prima del giorno termina sempre con "00".
//   o = come sessionParentBase;  canResume(sessionDoc) = predicato sul session.json su disco
function progressiveSessionDir(o, canResume) {
    const { parent, baseName, sep } = sessionParentBase(o);
    let names = [];
    try { names = fs.readdirSync(parent, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); }
    catch (e) { /* genitore non esiste ancora → prima somministrazione */ }
    const seq = FilesCore.sessionSeq(names, baseName, sep);
    if (seq.last && typeof canResume === 'function') {
        try {
            const doc = JSON.parse(fs.readFileSync(path.join(parent, seq.last, 'session.json'), 'utf8'));
            if (canResume(doc)) return { dir: path.join(parent, seq.last), resuming: true };
        } catch (e) { /* session.json assente/illeggibile → nuova */ }
    }
    return { dir: path.join(parent, baseName + sep + seq.next), resuming: false };
}

// Avvia (o RIPRENDE) una sessione quiz live. Payload dal renderer:
// { name (titolo mappa), activity, className, durationMin, roster, questions }
ipcMain.handle('live-start-session', async (event, opts) => {
    try {
        if (liveSrv) { await liveSrv.stop(); liveSrv = null; liveInfo = null; }
        const o = opts || {};
        const name = o.name || 'Quiz';
        // Progressivo per somministrazione (…-00, …-01, …): due quiz stesso giorno/classe
        // = cartelle distinte, mai ripresa della sessione chiusa precedente (crash-safe
        // solo sull'ultima ancora aperta, phase ≠ closed).
        const legacySlug = [slugLive(name), slugLive(o.activity || 'quiz'), slugLive(o.className || 'classe'), dateStamp()].join('-');
        const { dir, resuming } = progressiveSessionDir(
            { name, activity: o.activity || 'quiz', className: o.className || '', scope: o.scope || '', legacyBase: 'MappAI - Live', legacySlug },
            doc => doc && doc.session && doc.session.phase !== 'closed'
        );
        fs.mkdirSync(dir, { recursive: true });
        liveSrv = createLiveServer({
            repoRoot: __dirname, dir,
            // Timeline Live (008): mode/loginMode/hintMode/build pass-through (default = quiz storico)
            session: {
                name, activity: o.activity || 'Quiz', className: o.className || '',
                scope: o.scope || '',   // 010: ramo L1 coperto
                durationMin: Number(o.durationMin) || 0,
                mode: o.mode || 'quiz', loginMode: o.loginMode || 'individual',
                hintMode: o.hintMode || 'onrequest', build: o.build || null,
                revealAnswers: o.revealAnswers !== false   // report profilo con soluzioni (default ON)
            },
            roster: Array.isArray(o.roster) ? o.roster : [],
            questions: Array.isArray(o.questions) ? o.questions : []
        });
        let port = null, lastErr = null;
        for (let p = 8767; p <= 8777; p++) {
            try { port = await liveSrv.listen(p, '0.0.0.0'); break; } catch (e) { lastErr = e; }
        }
        if (!port) throw lastErr || new Error('nessuna porta libera 8767-8777');
        const st = liveSrv.state();
        liveInfo = {
            port, urls: lanUrls(port), token: st.session.token,
            adminToken: st.session.adminToken, dir, name, resumed: resuming
        };
        // Timeline "Costruisci" (mode build) ha una pagina studente diversa
        liveInfo = await maybeRelay('live', liveInfo, opts, 'live', o.mode === 'build' ? 'build' : null);
        console.log('[live] sessione quiz avviata su :' + port, resuming ? '(RIPRESA)' : '');
        return Object.assign({ success: true, questionCount: st.questionCount }, liveInfo);
    } catch (err) {
        console.error('Errore live-start-session:', err);
        liveSrv = null;
        return { success: false, error: err.message };
    }
});

ipcMain.handle('live-stop-session', async () => {
    try {
        closeRelay('live');
        if (liveSrv) { await liveSrv.stop(); liveSrv = null; liveInfo = null; }
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
});

// Info sessione (il polling della dashboard lo fa il renderer direttamente su
// 127.0.0.1:<port>/api/status con l'adminToken)
ipcMain.handle('live-session-info', async () => {
    if (!liveSrv || !liveInfo) return { success: false, error: 'nessuna sessione attiva' };
    return Object.assign({ success: true }, liveInfo, liveSrv.state());
});

ipcMain.handle('live-open-folder', async () => {
    const dir = liveInfo ? liveInfo.dir : liveBaseDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
    return { success: true, dir };
});

// ── Materiali di studio (download via QR, nessun login) ──
ipcMain.handle('live-materials-start', async (event, opts) => {
    try {
        if (liveMatSrv) { await liveMatSrv.stop(); liveMatSrv = null; liveMatInfo = null; }
        const name = (opts && opts.name) || 'Materiali';
        const dir = path.join(liveBaseDir(), 'materiali-' + slugLive(name) + '-' + dateStamp());
        liveMatSrv = createMaterialsServer({ repoRoot: __dirname, dir, session: { name } });
        let port = null, lastErr = null;
        for (let p = 8768; p <= 8778; p++) {
            try { port = await liveMatSrv.listen(p, '0.0.0.0'); break; } catch (e) { lastErr = e; }
        }
        if (!port) throw lastErr || new Error('nessuna porta libera 8768-8778');
        const st = liveMatSrv.state();
        liveMatInfo = { port, urls: lanUrls(port), token: st.session.token, dir, name, filesDir: liveMatSrv.filesDir };
        liveMatInfo = await maybeRelay('materials', liveMatInfo, opts, 'materials');
        console.log('[live] server materiali avviato su :' + port);
        return Object.assign({ success: true, files: st.files }, liveMatInfo);
    } catch (err) {
        console.error('Errore live-materials-start:', err);
        liveMatSrv = null;
        return { success: false, error: err.message };
    }
});

ipcMain.handle('live-materials-stop', async () => {
    try {
        closeRelay('materials');
        if (liveMatSrv) { await liveMatSrv.stop(); liveMatSrv = null; liveMatInfo = null; }
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('live-materials-info', async () => {
    if (!liveMatSrv || !liveMatInfo) return { success: false, error: 'nessun server materiali attivo' };
    return Object.assign({ success: true }, liveMatInfo, { files: liveMatSrv.state().files });
});

// Aggiunge file scelti dal docente nella cartella materiali (copia)
ipcMain.handle('live-materials-add', async () => {
    if (!liveMatInfo) return { success: false, error: 'nessun server materiali attivo' };
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Aggiungi materiali di studio', properties: ['openFile', 'multiSelections']
    });
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
    let added = 0;
    for (const src of result.filePaths) {
        try { fs.copyFileSync(src, path.join(liveMatInfo.filesDir, path.basename(src))); added++; }
        catch (e) { console.warn('[live] copia materiale fallita', src, e.message); }
    }
    return { success: true, added, files: liveMatSrv.state().files };
});

// Pubblica un HTML generato (dossier, sintesi...) come file materiale
ipcMain.handle('live-materials-add-html', async (event, { filename, html }) => {
    if (!liveMatInfo) return { success: false, error: 'nessun server materiali attivo' };
    const safe = path.basename(String(filename || 'materiale.html')).replace(/[^a-zA-Z0-9._-]+/g, '_');
    const target = path.join(liveMatInfo.filesDir, safe.endsWith('.html') ? safe : safe + '.html');
    fs.writeFileSync(target, String(html || ''));
    return { success: true, file: path.basename(target), files: liveMatSrv.state().files };
});

/* ⚠️ 13/8/26 — LIBRERIA «FILE CONDIVISI» PENSIONATA (decisione di Giacomo).
   Qui stavano `sharedMatDir/_smRead/_smWrite/_smPublic` e i cinque handler
   `sharedmat-list|add|remove|open-folder|publish`: una libreria persistente di
   file del docente (copia + storico delle classi) ricondivisibile via QR.
   La si poteva RIEMPIRE ma non svuotare: la vista che la elencava scriveva in un
   contenitore che la landing non ha più dopo il riordino, quindi i file
   restavano condivisi e invisibili. Per dare un file alla classe resta
   `live-materials-add` («Aggiungi file…»), che lo copia nel server della
   sessione — un gesto solo, senza una seconda casa da tenere in ordine.
   ⚠️ La CARTELLA resta e non si tocca: `sharedBaseDir()` è una delle sei di
   «MappAI - file» e ci sono ancora i file dei docenti che l'hanno usata. Da oggi
   nessuno ci scrive più; si aprono dal Finder. */

// ── Store classi su disco (roster credenziali) ──
ipcMain.handle('live-classes-load', async () => {
    try {
        const f = classiFile();
        if (!fs.existsSync(f)) return { success: true, data: { schema: 'mappai-classes@1', classes: [] } };
        return { success: true, data: JSON.parse(fs.readFileSync(f, 'utf8')) };
    } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('live-classes-save', async (event, data) => {
    try {
        const f = classiFile();
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, JSON.stringify(data || { schema: 'mappai-classes@1', classes: [] }, null, 2));
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
});

// class-doc-save (2/8): scrive un documento nella cartella di UNA classe o di
// UN allievo — oggi il foglio delle credenziali, generato da solo quando la
// classe si salva. Non riusa `save-pdf-to-vault`: quello, senza vaultPath,
// scrive dentro Mappe e NON sanitizza il nome del file.
ipcMain.handle('class-doc-save', async (event, { scope, name, fileName, base64 } = {}) => {
    try {
        if (!name || !fileName || !base64) return { success: false, error: 'dati mancanti' };
        const base = scope === 'student' ? studentsBaseDir() : classesBaseDir();
        const cartella = FilesCore.safeName(String(name));
        let file = FilesCore.safeName(String(fileName));
        if (!/\.pdf$/i.test(file)) file += '.pdf';
        if (!cartella || !file) return { success: false, error: 'nome non valido' };
        const dir = path.join(base, cartella);
        const dest = path.join(dir, file);
        // la guardia sta sul percorso RISOLTO: safeName toglie i separatori, ma
        // il controllo finale è quello che conta
        if (!path.resolve(dest).startsWith(path.resolve(base) + path.sep)) {
            return { success: false, error: 'fuori dalla cartella' };
        }
        fs.mkdirSync(dir, { recursive: true });
        const b = (/^data:/i.test(base64) && base64.indexOf(',') >= 0) ? base64.slice(base64.indexOf(',') + 1) : base64;
        fs.writeFileSync(dest, Buffer.from(b, 'base64'));
        return { success: true, path: dest, dir: dir };
    } catch (err) { return { success: false, error: err.message }; }
});

// student-folder-ensure: crea la cartella di un allievo (e «Allievi» con lei).
// Nasce col PROFILO, non con il primo file scritto: chi la apre dopo una
// generazione deve trovarla, non scoprire che esiste solo se ci si è scritto.
ipcMain.handle('student-folder-ensure', async (event, { name } = {}) => {
    try {
        const n = FilesCore.safeName(String(name || ''));
        if (!n) return { success: false, error: 'nome non valido' };
        const base = studentsBaseDir();
        const dir = path.join(base, n);
        if (!path.resolve(dir).startsWith(path.resolve(base) + path.sep)) {
            return { success: false, error: 'fuori da Allievi' };
        }
        fs.mkdirSync(path.join(dir, FilesCore.SUB.maps), { recursive: true });
        return { success: true, dir: dir };
    } catch (err) { return { success: false, error: err.message }; }
});

// class-doc-open: apre nel Finder la cartella di una classe o di un allievo.
// `pipeline-open-folder` non va bene: valida sotto Mappe, e queste stanno altrove.
ipcMain.handle('class-doc-open', async (event, { dir } = {}) => {
    try {
        if (!dir) return { success: false, error: 'percorso mancante' };
        const risolto = path.resolve(dir);
        const ok = [classesBaseDir(), studentsBaseDir()].some(b => {
            const rb = path.resolve(b);
            return risolto === rb || risolto.startsWith(rb + path.sep);
        });
        if (!ok) return { success: false, error: 'fuori da Classi/Allievi' };
        if (!fs.existsSync(risolto)) return { success: false, error: 'cartella-non-trovata' };
        await shell.openPath(risolto);
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
});

// ══════════════════════════════════════════════════════════════════════════
// REGISTRO CONSUMI AI — JSONL append-only su disco (una riga per chiamata AI).
// I record contengono SOLO token/modello/provider/contesto: i costi si
// calcolano a display-time nella dashboard (MODEL_KB + tasso USD→CHF).
// ══════════════════════════════════════════════════════════════════════════
function usageBaseDir() {
    return filesOrganized()
        ? path.join(mappaiRootDir(), 'Registro consumi AI')
        : path.join(documentsDir(), 'MappAI - Consumi AI');
}
function usageLogFile() { return path.join(usageBaseDir(), 'consumi-ai.jsonl'); }
function usageAppend(rec) {
    try {
        fs.mkdirSync(usageBaseDir(), { recursive: true });
        fs.appendFileSync(usageLogFile(), JSON.stringify(rec) + '\n', 'utf8');
        return true;
    } catch (e) { console.error('[usage] append fallito:', e.message); return false; }
}
ipcMain.handle('usage-log-append', (event, rec) => ({ success: usageAppend(rec || {}) }));
ipcMain.handle('usage-log-read', () => {
    try {
        if (!fs.existsSync(usageLogFile())) return { success: true, records: [] };
        const records = [];
        fs.readFileSync(usageLogFile(), 'utf8').split('\n').forEach(ln => {
            const t = ln.trim();
            if (!t) return;
            try { records.push(JSON.parse(t)); } catch (e) { /* riga corrotta: skip */ }
        });
        return { success: true, records };
    } catch (err) { return { success: false, error: err.message, records: [] }; }
});
ipcMain.handle('usage-open-folder', () => {
    try { fs.mkdirSync(usageBaseDir(), { recursive: true }); shell.openPath(usageBaseDir()); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
});

// ══════════════════════════════════════════════════════════════════════════
// TUTOR AI VIA QR — "Chatta e Scrivi" (007) · porte 8769-8779
// Sessioni: ~/Documents/MappAI - Tutor/<mappa>-<classe>-<data>/
// SICUREZZA: apiKey + systemInstruction arrivano dal renderer all'avvio e
// restano in memoria del main (passate al server come opts.secrets, MAI
// persistite né servite ai telefoni). Le chiamate AI partono da qui (callModel).
// ══════════════════════════════════════════════════════════════════════════
const { createTutorServer } = require('./tutor-server');
let tutorSrv = null, tutorInfo = null;
function tutorBaseDir() { return filesOrganized() ? activityBaseDir() : path.join(documentsDir(), 'MappAI - Tutor'); }

ipcMain.handle('tutor-start-session', async (event, opts) => {
    try {
        if (tutorSrv) { await tutorSrv.stop(); tutorSrv = null; tutorInfo = null; }
        const o = opts || {};
        if (!o.apiKey) return { success: false, error: 'api-key-mancante' };
        // Progressivo per somministrazione (…-00, …-01, …), crash-safe solo sull'ultima
        // ancora aperta (phase ≠ closed). Come Live: due sessioni Tutor stesso giorno/classe
        // = cartelle distinte, mai ripresa di quella conclusa.
        const legacySlug = [slugLive(o.name || 'mappa'), slugLive(o.className || 'classe'), dateStamp()].join('-');
        const scopeStr = o.scope || (o.topic && o.topic.label) || (typeof o.topic === 'string' ? o.topic : '') || '';
        const { dir, resuming } = progressiveSessionDir(
            { name: o.name, activity: 'tutor', className: o.className || '', scope: scopeStr, legacyBase: 'MappAI - Tutor', legacySlug },
            doc => doc && doc.session && doc.session.phase !== 'closed'
        );
        fs.mkdirSync(dir, { recursive: true });
        tutorSrv = createTutorServer({
            repoRoot: __dirname, dir,
            session: {
                name: o.name, className: o.className, topic: o.topic,
                scope: o.scope || (o.topic && o.topic.label) || '',   // 010: argomento coperto
                mode: o.mode, cap: o.cap, writingBrief: o.writingBrief,
                provider: o.provider, model: o.model, productId: o.productId,
                maxTokens: o.maxTokens
            },
            secrets: { apiKey: o.apiKey, systemInstruction: o.systemInstruction },
            roster: Array.isArray(o.roster) ? o.roster : [],
            // Wrapper: registra i token di ogni scambio nel registro consumi
            // (il tutor QR non passa da fetchModelAPI del renderer).
            callModel: async (args) => {
                const resp = await callModel(args);
                try {
                    const um = resp && resp.usageMetadata, iu = resp && resp.usage;
                    const inTok = (um && um.promptTokenCount) || (iu && iu.prompt_tokens) || 0;
                    const outTok = (um && um.candidatesTokenCount) || (iu && iu.completion_tokens) || 0;
                    if (inTok || outTok) usageAppend({
                        ts: new Date().toISOString(),
                        provider: o.provider === 'infomaniak' ? 'infomaniak' : 'google',
                        model: o.model || '?', inTok, outTok,
                        cat: 'tutor', sub: 'qr',
                        project: o.name || 'Senza titolo', projectId: null
                    });
                } catch (e) { /* il tracking non deve mai rompere la chat */ }
                return resp;
            }
        });
        let port = null, lastErr = null;
        for (let p = 8769; p <= 8779; p++) {
            try { port = await tutorSrv.listen(p, '0.0.0.0'); break; } catch (e) { lastErr = e; }
        }
        if (!port) throw lastErr || new Error('nessuna porta libera 8769-8779');
        const st = tutorSrv.state();
        tutorInfo = {
            port, urls: lanUrls(port), token: st.session.token,
            adminToken: st.session.adminToken, dir, name: o.name, resumed: resuming
        };
        tutorInfo = await maybeRelay('tutor', tutorInfo, o, 'tutor');
        console.log('[tutor] sessione Chatta-e-Scrivi avviata su :' + port, resuming ? '(RIPRESA)' : '');
        return Object.assign({ success: true }, tutorInfo);
    } catch (err) {
        console.error('Errore tutor-start-session:', err);
        tutorSrv = null;
        return { success: false, error: err.message };
    }
});

ipcMain.handle('tutor-stop-session', async () => {
    try {
        closeRelay('tutor');
        if (tutorSrv) { await tutorSrv.stop(); tutorSrv = null; tutorInfo = null; }
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('tutor-session-info', async () => {
    if (!tutorSrv || !tutorInfo) return { success: false, error: 'nessuna sessione attiva' };
    return Object.assign({ success: true }, tutorInfo, tutorSrv.state());
});

ipcMain.handle('tutor-open-folder', async () => {
    const dir = tutorInfo ? tutorInfo.dir : tutorBaseDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
    return { success: true, dir };
});

// MEMORY DUNGEON: scrive un piano validato in Memory Dungeon/piani/piano-N.json.
// Usato dall'import in-app (la validazione avviene nel renderer, contratto §4).
ipcMain.handle('save-dungeon-floor', async (event, { vaultPath, plan }) => {
    try {
        if (!vaultPath || !plan) return { success: false, error: 'vaultPath o plan mancante' };
        const m = typeof plan.id === 'string' ? plan.id.match(/^piano-(\d+)$/) : null;
        if (!m) return { success: false, error: 'campo "id" non valido (atteso "piano-N")' };
        const pianiDir = path.join(vaultPath, 'Memory Dungeon', 'piani');
        if (!fs.existsSync(pianiDir)) fs.mkdirSync(pianiDir, { recursive: true });
        const target = path.join(pianiDir, 'piano-' + m[1] + '.json');
        const existed = fs.existsSync(target);
        fs.writeFileSync(target, JSON.stringify(plan, null, 2), 'utf-8');
        return { success: true, file: 'piano-' + m[1] + '.json', overwritten: existed };
    } catch (err) {
        console.error('Errore save-dungeon-floor:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-all-vaults', async () => {
    try {
        const saveDir = mapsBaseDir();   // 010
        if (!fs.existsSync(saveDir)) return [];
        const EXCLUDE = (FilesCore && FilesCore.VAULT_CONTAINER_EXCLUDE) || [];

        // Legge un vault (cartella con index.yaml). classDir = basename del contenitore
        // di classe se annidato (011), assente per i vault flat. Shape INVARIATA.
        function readVaultInfo(vaultPath, folderName, classDir, discDir) {
            const indexPath = path.join(vaultPath, 'index.yaml');
            if (!fs.existsSync(indexPath)) return null;
            const vaultInfo = { folderName: folderName, fullPath: vaultPath };
            if (classDir) vaultInfo.classDir = classDir;
            if (discDir) vaultInfo.discDir = discDir;   // 29/7: livello disciplina dentro la classe
            try {
                const parsed = yaml.load(fs.readFileSync(indexPath, 'utf-8')) || {};
                vaultInfo.extractionMode = parsed.extractionMode || 'mindmap';
                vaultInfo.rootNodeLabel  = parsed.rootNodeLabel  || folderName;
                /* dichiarate dal vault: servono ai vault arrivati da fuori, che
                   non stanno dentro le cartelle classe/materia (9/8) */
                vaultInfo.classeDichiarata  = parsed.classe  || '';
                vaultInfo.materiaDichiarata = parsed.materia || '';
                vaultInfo.lastUpdated    = parsed.lastUpdated    || '';
                if (parsed.userProfile) {
                    vaultInfo.nickname = parsed.userProfile.nickname;
                    vaultInfo.age      = parsed.userProfile.age;
                }
            } catch (e) {
                console.warn(`[MappAI] Errore parsing index.yaml in ${folderName}:`, e.message);
                // Fallback legacy riga-per-riga
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
            return vaultInfo;
        }

        const vaults = [];
        fs.readdirSync(saveDir).forEach(f => {
            const p = path.join(saveDir, f);
            let st; try { st = fs.statSync(p); } catch (e) { return; }
            if (!st.isDirectory() || EXCLUDE.indexOf(f) >= 0) return;
            // Livello 1: cartella CON index.yaml = vault (comportamento storico).
            if (fs.existsSync(path.join(p, 'index.yaml'))) {
                const vi = readVaultInfo(p, f, null);
                if (vi) vaults.push(vi);
                return;
            }
            // Livello 2: contenitore di classe (nessun index.yaml) → scandire 1 livello.
            let children; try { children = fs.readdirSync(p); } catch (e) { return; }
            children.forEach(c => {
                const cp = path.join(p, c);
                let cst; try { cst = fs.statSync(cp); } catch (e) { return; }
                if (!cst.isDirectory()) return;
                if (fs.existsSync(path.join(cp, 'index.yaml'))) {
                    const vi = readVaultInfo(cp, c, f, null);   // folderName = basename del vault; classDir = contenitore
                    if (vi) vaults.push(vi);
                    return;
                }
                // Livello 3 (29/7): cartella DISCIPLINA dentro la classe. Solo qui —
                // oltre non si scende, così una cartella spuria non fa esplodere la
                // scansione. Classi senza discipline restano a 2 livelli.
                let gchildren; try { gchildren = fs.readdirSync(cp); } catch (e) { return; }
                gchildren.forEach(g => {
                    const gp = path.join(cp, g);
                    let gst; try { gst = fs.statSync(gp); } catch (e) { return; }
                    if (!gst.isDirectory()) return;
                    const vi = readVaultInfo(gp, g, f, c);   // classDir = classe · discDir = disciplina
                    if (vi) vaults.push(vi);
                });
            });
        });

        /* Le mappe fatte per un ALLIEVO (2/8) stanno in «Allievi/<nome>/Mappe»,
           fuori da Mappe: se non le si scandisce qui, esistono su disco ma per
           l'app non esistono — non comparirebbero né nella console né in
           INSEGNA. Portano `studentDir`, che è il loro contenitore: chi legge
           distingue così una mappa di classe da una personale. */
        const stuBase = studentsBaseDir();
        if (fs.existsSync(stuBase)) {
            fs.readdirSync(stuBase).forEach(nome => {
                const mappeDir = path.join(stuBase, nome, FilesCore.SUB.maps);
                let st; try { st = fs.statSync(mappeDir); } catch (e) { return; }
                if (!st.isDirectory()) return;
                let figli; try { figli = fs.readdirSync(mappeDir); } catch (e) { return; }
                figli.forEach(v => {
                    const vp = path.join(mappeDir, v);
                    let vst; try { vst = fs.statSync(vp); } catch (e) { return; }
                    if (!vst.isDirectory()) return;
                    const vi = readVaultInfo(vp, v, null, null);
                    if (vi) { vi.studentDir = nome; vaults.push(vi); }
                });
            });
        }

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
        const vaultBaseDir = mapsBaseDir();   // 010
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
    const saveDir = mapsBaseDir();   // 010
    if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
    }
    shell.openPath(saveDir);
});

// ── Apri la cartella vault di una mappa nel Finder (sezione Progetti, Insegna 19/7) ──
ipcMain.handle('open-vault-folder', async (event, { vaultName } = {}) => {
    try {
        const safe = path.basename(String(vaultName || ''));
        if (!safe || safe === '.' || safe === '..') return { success: false, error: 'nome-non-valido' };
        const dir = path.join(mapsBaseDir(), safe);
        if (!fs.existsSync(dir)) return { success: false, error: 'cartella-non-trovata' };
        await shell.openPath(dir);
        return { success: true, dir };
    } catch (err) { return { success: false, error: err.message }; }
});

// ── Zip della cartella vault → cartella materiali attiva (condivisione QR, 19/7) ──
// Richiede il server Materiali attivo (liveMatInfo). jszip è dipendenza transitiva
// di docx/mammoth (produzione) → presente anche nell'app pacchettizzata.
ipcMain.handle('zip-vault-to-materials', async (event, { vaultName } = {}) => {
    try {
        if (!liveMatInfo) return { success: false, error: 'nessun server materiali attivo' };
        const safe = path.basename(String(vaultName || ''));
        if (!safe || safe === '.' || safe === '..') return { success: false, error: 'nome-non-valido' };
        const srcDir = path.join(mapsBaseDir(), safe);
        if (!fs.existsSync(srcDir)) return { success: false, error: 'cartella-non-trovata' };
        const JSZip = require('jszip');
        const zip = new JSZip();
        const root = zip.folder(safe);
        const addDir = (absDir, zf) => {
            for (const ent of fs.readdirSync(absDir, { withFileTypes: true })) {
                const abs = path.join(absDir, ent.name);
                if (ent.isDirectory()) addDir(abs, zf.folder(ent.name));
                else if (ent.isFile()) { try { zf.file(ent.name, fs.readFileSync(abs)); } catch (e) { /* skip unreadable */ } }
            }
        };
        addDir(srcDir, root);
        const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        const fileName = safe.replace(/[^a-zA-Z0-9._-]+/g, '_') + '.zip';
        fs.writeFileSync(path.join(liveMatInfo.filesDir, fileName), buf);
        return { success: true, file: fileName, files: liveMatSrv ? liveMatSrv.state().files : [] };
    } catch (err) { console.error('zip-vault-to-materials:', err); return { success: false, error: err.message }; }
});

// ── Apri la cartella di una sessione di studio nel Finder (registro attività, 19/7) ──
ipcMain.handle('study-session-open-folder', async (event, { dir } = {}) => {
    try {
        const abs = path.resolve(String(dir || ''));
        const roots = studyRootsForListing().map(r => path.resolve(r.dir));
        const ok = roots.some(root => abs === root || abs.startsWith(root + path.sep)) && fs.existsSync(abs);
        if (!ok) return { success: false, error: 'percorso-non-consentito' };
        await shell.openPath(abs);
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
});

// ══════════════════════════════════════════════════════════════════════════
// ORGANIZZAZIONE FILE (010) — IPC: stato, scelta posizione, setup+migrazione,
// registro attività di studio (enumerazione sessioni + apertura report).
// ══════════════════════════════════════════════════════════════════════════

// Stato corrente per la UI impostazioni.
ipcMain.handle('files-root-get', async () => {
    const s = readSettings();
    return {
        organized: filesOrganized(),
        filesRoot: s.filesRoot || null,
        rootDir: filesOrganized() ? mappaiRootDir() : null,
        documentsDir: documentsDir(),
        mapsBaseDir: mapsBaseDir(),  // 011: base per la pipeline (costruzione folderPath)
        studentsBaseDir: studentsBaseDir()   // 2/8: le mappe di un profilo allievo stanno qui
    };
});

// Selezione cartella dove creare "MappAI - file" (nessuna scrittura).
ipcMain.handle('files-root-choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Scegli dove creare la cartella "MappAI - file"'
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { canceled: false, filesRoot: result.filePaths[0] };
});

// Descrive le cartelle storiche presenti in ~/Documents (per il piano migrazione).
function scanLegacyOnDisk() {
    const out = [];
    FilesCore.LEGACY.forEach(L => {
        const base = path.join(documentsDir(), L.old);
        if (!fs.existsSync(base)) return;
        let entries = [];
        try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch (e) { return; }
        const children = entries.filter(e => e.isDirectory() || e.isFile()).map(e => {
            const child = { folder: e.name };
            if (L.kind === 'sessions' && e.isDirectory()) {
                // legge la classe dalla session.json per il bucketing per-classe
                try {
                    const sj = JSON.parse(fs.readFileSync(path.join(base, e.name, 'session.json'), 'utf8'));
                    const s = (sj && sj.session) || sj || {};
                    child.className = s.className || '';
                } catch (e2) { child.className = ''; }
            }
            return child;
        });
        out.push({ old: L.old, sub: L.sub, kind: L.kind, children });
    });
    return out;
}

// Anteprima del piano: quante cartelle si spostano, per tipo (per la conferma UI).
ipcMain.handle('files-migrate-preview', async () => {
    try {
        const legacy = scanLegacyOnDisk();
        const plan = FilesCore.planMigration(legacy);
        const byType = legacy.map(L => ({ from: L.old, to: FilesCore.SUB[L.sub], count: (L.children || []).length }))
            .filter(x => x.count > 0);
        return { success: true, total: plan.moves.length, byType };
    } catch (err) { return { success: false, error: err.message }; }
});

// Sposta una cartella (rename atomico; fallback copia+cancella se cross-device).
function moveDirSafe(from, to) {
    if (fs.existsSync(to)) return 'skipped'; // mai sovrascrivere
    fs.mkdirSync(path.dirname(to), { recursive: true });
    try {
        fs.renameSync(from, to);
    } catch (e) {
        if (e.code === 'EXDEV') { copyRecursiveSync(from, to); fs.rmSync(from, { recursive: true, force: true }); }
        else throw e;
    }
    return 'moved';
}

// Setup: crea "MappAI - file" + sottocartelle, (opzionale) migra i dati storici,
// poi attiva la feature. Ritorna la mappa vault old→new per riparare i path in localStorage.
ipcMain.handle('files-setup', async (event, opts) => {
    try {
        const o = opts || {};
        const filesRoot = String(o.filesRoot || '').trim();
        if (!filesRoot || !fs.existsSync(filesRoot)) return { success: false, error: 'posizione-non-valida' };
        const root = path.join(filesRoot, FilesCore.ROOT_FOLDER);
        fs.mkdirSync(root, { recursive: true });
        Object.keys(FilesCore.SUB).forEach(k => fs.mkdirSync(path.join(root, FilesCore.SUB[k]), { recursive: true }));

        let moved = 0, skipped = 0; const vaultMap = {}; const log = [];
        if (o.migrate) {
            const legacy = scanLegacyOnDisk();
            const plan = FilesCore.planMigration(legacy);
            plan.dirs.forEach(segs => fs.mkdirSync(path.join(root, ...segs), { recursive: true }));
            plan.moves.forEach(m => {
                const from = path.join(documentsDir(), ...m.from);
                const to = path.join(root, ...m.to);
                if (!fs.existsSync(from)) return;
                try {
                    const r = moveDirSafe(from, to);
                    if (r === 'moved') { moved++; log.push({ from, to }); if (m.to[0] === FilesCore.SUB.maps) vaultMap[from] = to; }
                    else skipped++;
                } catch (e) { log.push({ from, to, error: e.message }); }
            });
            // rimuove le cartelle storiche ora vuote
            FilesCore.LEGACY.forEach(L => {
                const base = path.join(documentsDir(), L.old);
                try { if (fs.existsSync(base) && fs.readdirSync(base).length === 0) fs.rmdirSync(base); } catch (e) { }
            });
            try { fs.writeFileSync(path.join(root, 'migrazione-log.json'), JSON.stringify({ date: Date.now(), moved, skipped, log }, null, 2)); } catch (e) { }
        }

        writeSettings({ filesRoot: filesRoot, filesOrganized: true });
        initDefaultVaultFolder(); // assicura il vault demo in Mappe se vuoto
        return { success: true, rootDir: root, moved, skipped, vaultMap };
    } catch (err) {
        console.error('[files] files-setup', err);
        return { success: false, error: err.message };
    }
});

// Apre la cartella madre "MappAI - file" nel file manager.
ipcMain.handle('files-open-root', async () => {
    const dir = mappaiRootDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
    return { success: true, dir };
});

// ── Registro attività di studio: enumera le sessioni su disco + i report ────
// Cerca in "Attività di studio" (organizzato) o nelle 3 cartelle storiche.
function studyRootsForListing() {
    if (filesOrganized()) return [{ dir: activityBaseDir(), type: 'auto' }];
    return [
        { dir: path.join(documentsDir(), 'MappAI - Live'), type: 'live' },
        { dir: path.join(documentsDir(), 'MappAI - Tutor'), type: 'tutor' },
        { dir: path.join(documentsDir(), 'MappAI - Lavagna'), type: 'lavagna' }
    ];
}
// Riconosce una cartella-sessione (ha session.json) e ne costruisce il record.
function readSessionFolder(absDir, type) {
    const sjPath = path.join(absDir, 'session.json');
    if (!fs.existsSync(sjPath)) return null;
    let session = null, results = null;
    try { session = JSON.parse(fs.readFileSync(sjPath, 'utf8')); } catch (e) { return null; }
    try { const rp = path.join(absDir, 'results.json'); if (fs.existsSync(rp)) results = JSON.parse(fs.readFileSync(rp, 'utf8')); } catch (e) { }
    let files = [];
    try { files = fs.readdirSync(absDir).filter(f => /^report-.*\.html$/i.test(f)); } catch (e) { }
    // materiali/lavagna senza session-quiz: tipo dedotto da session.activity
    const rec = FilesCore.sessionRecordFrom({ folder: absDir, activityType: type === 'auto' ? '' : type, session, results, reportFiles: files });
    rec.reports = rec.reports.map(r => ({ which: r.which, label: r.label, file: path.join(absDir, r.file) }));
    rec.dir = absDir;
    // Lavagna: nessun report HTML né roster → i gruppi (board.json) fanno da partecipanti,
    // altrimenti la sessione sparirebbe dal registro (filtro reports/total nel list).
    const sObj = session.session || session;
    if ((session.schema === 'mappai-collab-session@1' || (sObj && sObj.activity === 'lavagna'))) {
        try {
            const bp = path.join(absDir, 'board.json');
            if (fs.existsSync(bp)) {
                const groups = JSON.parse(fs.readFileSync(bp, 'utf8')).groups || [];
                rec.total = groups.length;
                rec.participants = groups.filter(g => g && g.done).length;
            }
        } catch (e) { /* board illeggibile → resta 0 (verrà filtrata) */ }
    }
    return rec;
}
// Cammina ricorsivamente (max 3 livelli: sub/classe/sessione) cercando session.json.
function walkStudySessions(root, type, depth, acc) {
    if (depth > 3) return;
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (e) { return; }
    if (entries.some(e => e.isFile() && e.name === 'session.json')) {
        const rec = readSessionFolder(root, type);
        if (rec) acc.push(rec);
        return; // una cartella-sessione non contiene sotto-sessioni
    }
    entries.filter(e => e.isDirectory()).forEach(e => walkStudySessions(path.join(root, e.name), type, depth + 1, acc));
}

ipcMain.handle('study-sessions-list', async () => {
    try {
        const acc = [];
        studyRootsForListing().forEach(r => { if (fs.existsSync(r.dir)) walkStudySessions(r.dir, r.type, 0, acc); });
        // solo sessioni con almeno un report O una classe/data (esclude cartelle materiali vuote)
        const rows = acc.filter(r => r.reports.length > 0 || r.total > 0);
        rows.sort((a, b) => (b.date || 0) - (a.date || 0)); // più recenti prima
        return { success: true, rows };
    } catch (err) { return { success: false, error: err.message, rows: [] }; }
});

// Apre un file di report nel browser/visualizzatore di sistema. Sicurezza:
// il file deve stare dentro una delle radici di studio conosciute.
ipcMain.handle('study-report-open', async (event, filePath) => {
    try {
        const abs = path.resolve(String(filePath || ''));
        const roots = studyRootsForListing().map(r => path.resolve(r.dir));
        const ok = roots.some(root => abs === root || abs.startsWith(root + path.sep)) && /\.html?$/i.test(abs) && fs.existsSync(abs);
        if (!ok) return { success: false, error: 'percorso-non-consentito' };
        await shell.openPath(abs);
        return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
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
