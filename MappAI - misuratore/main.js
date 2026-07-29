/**
 * MappAI - misuratore — processo main.
 *
 * REGOLA PORTANTE (contracts/ipc-and-snapshot.md): qui dentro sta SOLO I/O e
 * gestione finestre. Nessun calcolo di metriche, nessuna logica di indice.
 * I core puri vivono in public/js/core/ e sono testabili in Node senza Electron:
 * se una funzione di misura finisse qui, smetterebbe di essere testabile.
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

// ────────────────────────────────────────────────────────────────────────────
// T005 — Radice dati. UNICO punto in cui il percorso dei dati è deciso.
// Alla pacchettizzazione questa funzione va spostata su app.getPath('documents')
// perché dentro un .app il percorso di progetto è in sola lettura
// (plan.md → Complexity Tracking). Cambiare QUI e in nessun altro posto.
// ────────────────────────────────────────────────────────────────────────────
const CARTELLA_DATI = 'MappAI - misuratore - FILE';

function radiceDati() {
    const radice = app.isPackaged
        ? path.join(app.getPath('documents'), CARTELLA_DATI)
        : path.join(__dirname, CARTELLA_DATI);
    return {
        radice,
        upload: path.join(radice, 'Upload'),
        report: path.join(radice, 'Report'),
        datiReport: path.join(radice, 'Report', '_dati'),
        profili: path.join(radice, 'profili'),
    };
}

function assicuraCartelle() {
    const d = radiceDati();
    for (const p of [d.radice, d.upload, d.report, d.datiReport, d.profili]) {
        if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    }
    return d;
}

// ────────────────────────────────────────────────────────────────────────────
// Finestre
// ────────────────────────────────────────────────────────────────────────────
let finestraPrincipale = null;
const finestreReport = new Map();

function creaFinestra() {
    finestraPrincipale = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 1024,
        minHeight: 640,
        title: 'MappAI - misuratore',
        backgroundColor: '#f8fafc',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    finestraPrincipale.loadFile(path.join(__dirname, 'public', 'index.html'));
    finestraPrincipale.on('closed', () => { finestraPrincipale = null; });
}

app.whenReady().then(() => {
    assicuraCartelle();
    creaFinestra();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) creaFinestra();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ────────────────────────────────────────────────────────────────────────────
// IPC — radice dati
// ────────────────────────────────────────────────────────────────────────────
ipcMain.handle('dati-radice', async () => {
    const d = assicuraCartelle();
    return { ...d, esiste: fs.existsSync(d.radice) };
});

ipcMain.handle('apri-cartella-dati', async () => {
    const d = assicuraCartelle();
    await shell.openPath(d.radice);
    return { ok: true };
});

// ────────────────────────────────────────────────────────────────────────────
// IPC — profili di parametri
// La VALIDAZIONE non sta qui: è in mis-profile-core, che il renderer esegue
// prima di chiamare. Qui si controlla solo che arrivi un oggetto salvabile.
// ────────────────────────────────────────────────────────────────────────────
ipcMain.handle('profili-lista', async () => {
    const d = assicuraCartelle();
    const fuori = [];
    const predefinito = path.join(__dirname, 'public', 'profili', 'predefinito.json');
    if (fs.existsSync(predefinito)) {
        fuori.push(JSON.parse(await fsp.readFile(predefinito, 'utf8')));
    }
    if (fs.existsSync(d.profili)) {
        for (const f of await fsp.readdir(d.profili)) {
            if (!f.endsWith('.json')) continue;
            try { fuori.push(JSON.parse(await fsp.readFile(path.join(d.profili, f), 'utf8'))); }
            catch (e) { /* profilo illeggibile: ignorato, non fa cadere la lista */ }
        }
    }
    return fuori;
});

ipcMain.handle('profilo-salva', async (_e, { profilo }) => {
    if (!profilo || !profilo.id) return { ok: false, errori: [{ campo: 'id', messaggio: 'Profilo senza id' }] };
    const d = assicuraCartelle();
    const nomeFile = String(profilo.id).replace(/[^\w@.\-]/g, '_') + '.json';
    await fsp.writeFile(path.join(d.profili, nomeFile), JSON.stringify(profilo, null, 2), 'utf8');
    return { ok: true, file: nomeFile };
});

module.exports = { radiceDati };
