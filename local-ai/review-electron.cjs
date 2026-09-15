/* Native review window: same bank/store as the CLI, no HTTP server or Python. */
'use strict';
const path = require('node:path'), fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { createStore } = require('./review-bank.cjs');

function installReviewBank({ app, BrowserWindow, ipcMain, dialog, mainWindow, readSettings, writeSettings }) {
  const file = path.join(__dirname, 'review.html'), url = pathToFileURL(file).href;
  let window, store, opening, allowClose = false, quitting = false;
  const from = (event, win) => !!win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame === event.sender.mainFrame;
  const fromBank = event => from(event, window) && event.senderFrame.url === url;

  async function open() {
    if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); return { ok: true }; }
    let directory = readSettings().reviewBankDirectory;
    if (!directory && !app.isPackaged) directory = path.resolve(__dirname, '../local-ai-data/review');
    if (!directory || !fs.existsSync(path.join(directory, 'packet.json'))) {
      const picked = await dialog.showOpenDialog(mainWindow(), {
        title: 'Apri banco di validazione', buttonLabel: 'Apri banco',
        message: 'Scegli la cartella del banco con packet.json, PDF e annotazioni. Le revisioni già presenti saranno riprese.',
        properties: ['openDirectory']
      });
      if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true };
      directory = picked.filePaths[0];
    }
    const nextStore = createStore(directory);
    nextStore.load(); // A damaged history must never be replaced by an empty one.
    writeSettings({ reviewBankDirectory: directory });
    store = nextStore; allowClose = false;
    const parent = mainWindow(), bounds = parent.getBounds();
    window = new BrowserWindow({
      width: bounds.width, height: bounds.height, minWidth: 700, minHeight: 600,
      title: 'MappAI — Banco di validazione', show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true,
        preload: path.join(__dirname, 'review-preload.cjs') }
    });
    const win = window;
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, destination) => { if (destination !== url) event.preventDefault(); });
    win.webContents.on('render-process-gone', () => { allowClose = true; });
    win.on('close', event => {
      if (!allowClose) { event.preventDefault(); win.webContents.send('review-bank-closing'); }
    });
    win.on('closed', () => {
      window = null; store = null;
      if (quitting) app.quit();
    });
    try {
      await win.loadFile(file);
      if (parent.isMaximized()) win.maximize();
      win.show();
      return { ok: true };
    } catch (error) { win.destroy(); throw error; }
  }
  ipcMain.handle('review-bank-open', async event => {
    if (!from(event, mainWindow())) return { ok: false, error: 'Origine non autorizzata.' };
    // Double clicks share the same opening, including the native folder picker.
    if (!opening) opening = open().catch(error => ({ ok: false, error: error.message })).finally(() => { opening = null; });
    return opening;
  });
  ipcMain.handle('review-bank-request', (event, route, body) => {
    if (!fromBank(event)) return { error: 'Origine non autorizzata.' };
    try { return { value: store.request(route, body) }; }
    catch (error) { return { error: error.message }; }
  });
  ipcMain.on('review-bank-close', event => {
    if (!fromBank(event)) return;
    allowClose = true; window.close();
    const parent = mainWindow();
    if (!quitting && parent && !parent.isDestroyed()) { parent.show(); parent.focus(); }
  });
  ipcMain.handle('review-bank-close-failed', async event => {
    if (!fromBank(event)) return;
    const win = window;
    const choice = await dialog.showMessageBox(win, {
      type: 'warning', title: 'Annotazioni non salvate',
      message: 'Il salvataggio non è riuscito.',
      detail: 'Puoi restare nel banco e usare «Copia annotazioni». Uscendo perderai solo le modifiche non salvate; le revisioni già su disco restano conservate.',
      buttons: ['Resta nel banco', 'Esci senza salvare'], defaultId: 0, cancelId: 0, noLink: true
    });
    if (choice.response === 1 && !win.isDestroyed()) win.destroy();
    else quitting = false;
  });
  app.on('before-quit', event => {
    quitting = true;
    // Keep the main window alive until the bank has saved or the user cancels.
    if (window && !allowClose) { event.preventDefault(); window.close(); }
  });
}
module.exports = { installReviewBank };
