# Report di Compatibilità iPadOS / Capacitor

Scansione eseguita su: `/Users/giacomomeschini/Antigravity/MappAI`

## 📊 Riepilogo dei Problemi

- **File controllati:** 15
- **File con problemi:** 7
- **Totale anomalie:** 171

| Severità | Quantità |
|---|---|
| 🛑 Critical (Bloccante) | 111 |
| ⚠️ High (Rischio errore) | 56 |
| 💡 Warning (Touch/UX) | 4 |

---

## 🔍 Dettaglio delle Violazioni

### 📂 [:MappAI Storage & System Polyfill:public.js](file:///Users/giacomomeschini/Antigravity/MappAI/:MappAI Storage & System Polyfill:public.js)

#### Linea 89 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `window.electronAPI = {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 467 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `Apri il tuo file `index.html` e aggiungi lo script del `storageAdapter.js` prima del caricamento di`app.js`.In questo modo, l'adattatore caricherà la finta interfaccia `window.electronAPI` prima che l'applicazione provi ad usarla.`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

### 📂 [main.js](file:///Users/giacomomeschini/Antigravity/MappAI/main.js)

#### Linea 1 - Importazioni di Moduli Node.js Nativi (`🛑 CRITICAL`)
- **Descrizione:** I moduli nativi di Node.js non sono disponibili in ambiente browser/Capacitor su iPadOS.
- **Codice rilevato:** `require('electron'`
- **Contesto:** `const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');`
- **💡 Soluzione suggerita:** Usa API web standard o plugin nativi di Capacitor (es. @capacitor/filesystem).

#### Linea 1 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 2 - Importazioni di Moduli Node.js Nativi (`🛑 CRITICAL`)
- **Descrizione:** I moduli nativi di Node.js non sono disponibili in ambiente browser/Capacitor su iPadOS.
- **Codice rilevato:** `require('path'`
- **Contesto:** `const path = require('path');`
- **💡 Soluzione suggerita:** Usa API web standard o plugin nativi di Capacitor (es. @capacitor/filesystem).

#### Linea 3 - Importazioni di Moduli Node.js Nativi (`🛑 CRITICAL`)
- **Descrizione:** I moduli nativi di Node.js non sono disponibili in ambiente browser/Capacitor su iPadOS.
- **Codice rilevato:** `require('fs'`
- **Contesto:** `const fs = require('fs');`
- **💡 Soluzione suggerita:** Usa API web standard o plugin nativi di Capacitor (es. @capacitor/filesystem).

#### Linea 4 - Importazioni di Moduli Node.js Nativi (`🛑 CRITICAL`)
- **Descrizione:** I moduli nativi di Node.js non sono disponibili in ambiente browser/Capacitor su iPadOS.
- **Codice rilevato:** `require('https'`
- **Contesto:** `const https = require('https');`
- **💡 Soluzione suggerita:** Usa API web standard o plugin nativi di Capacitor (es. @capacitor/filesystem).

#### Linea 8 - Importazioni di Moduli Node.js Nativi (`🛑 CRITICAL`)
- **Descrizione:** I moduli nativi di Node.js non sono disponibili in ambiente browser/Capacitor su iPadOS.
- **Codice rilevato:** `require('os'`
- **Contesto:** `const os = require('os');`
- **💡 Soluzione suggerita:** Usa API web standard o plugin nativi di Capacitor (es. @capacitor/filesystem).

#### Linea 9 - Importazioni di Moduli Node.js Nativi (`🛑 CRITICAL`)
- **Descrizione:** I moduli nativi di Node.js non sono disponibili in ambiente browser/Capacitor su iPadOS.
- **Codice rilevato:** `require('crypto'`
- **Contesto:** `const crypto = require('crypto');`
- **💡 Soluzione suggerita:** Usa API web standard o plugin nativi di Capacitor (es. @capacitor/filesystem).

#### Linea 45 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('generate-gemini', async (event, { apiKey, payload, model }) => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 75 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('generate-infomaniak', async (event, { apiKey, payload, productId }) => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 152 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('list-infomaniak-models', async (event, { apiKey, productId }) => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 191 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('list-models', async (event, { apiKey }) => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 229 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('open-external', async (event, url) => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 239 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('capture-page', async () => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 246 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('save-map-json', async (event, mapData) => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 270 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('save-chat-transcript', async (event, { projectName, targetName, textContent, vaultPath }) => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 304 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('save-vault', async (event, { folderPath, mapData }) => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 496 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('load-vault', async (event, folderPath) => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 627 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('get-all-vaults', async () => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 668 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('pick-folder', async () => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 669 - Importazioni di Moduli Node.js Nativi (`🛑 CRITICAL`)
- **Descrizione:** I moduli nativi di Node.js non sono disponibili in ambiente browser/Capacitor su iPadOS.
- **Codice rilevato:** `require('electron'`
- **Contesto:** `const { dialog } = require('electron');`
- **💡 Soluzione suggerita:** Usa API web standard o plugin nativi di Capacitor (es. @capacitor/filesystem).

#### Linea 681 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('open-save-folder', async () => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 691 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('upload-file-gemini', async (event, { apiKey, filePath, mimeType, displayName }) => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 751 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('pick-file', async () => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 752 - Importazioni di Moduli Node.js Nativi (`🛑 CRITICAL`)
- **Descrizione:** I moduli nativi di Node.js non sono disponibili in ambiente browser/Capacitor su iPadOS.
- **Codice rilevato:** `require('electron'`
- **Contesto:** `const { dialog } = require('electron');`
- **💡 Soluzione suggerita:** Usa API web standard o plugin nativi di Capacitor (es. @capacitor/filesystem).

#### Linea 765 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('parse-docx', async (event, filePath) => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 775 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('get-machine-id', () => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 792 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('fetch-url', async (event, url) => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 819 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('load-prompts', async () => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 845 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcMain`
- **Contesto:** `ipcMain.handle('save-prompts', async (event, promptsData) => {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

### 📂 [public/js/admin_prompts.js](file:///Users/giacomomeschini/Antigravity/MappAI/public/js/admin_prompts.js)

#### Linea 117 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI && window.electronAPI.loadPrompts) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 117 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI && window.electronAPI.loadPrompts) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 118 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `const res = await window.electronAPI.loadPrompts();`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 218 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI && window.electronAPI.savePrompts) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 218 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI && window.electronAPI.savePrompts) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 219 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `const res = await window.electronAPI.savePrompts(window.systemPromptsConfig);`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

### 📂 [public/js/app.js](file:///Users/giacomomeschini/Antigravity/MappAI/public/js/app.js)

#### Linea 189 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI && window.electronAPI.openExternal) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 189 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI && window.electronAPI.openExternal) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 190 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `window.electronAPI.openExternal(url);`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 903 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (!window.electronAPI || !window.electronAPI.listInfomaniakModels) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 903 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (!window.electronAPI || !window.electronAPI.listInfomaniakModels) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 906 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `rawModels = await window.electronAPI.listInfomaniakModels({ apiKey, productId });`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 908 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (!window.electronAPI || !window.electronAPI.listModels) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 908 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (!window.electronAPI || !window.electronAPI.listModels) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 911 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `rawModels = await window.electronAPI.listModels({ apiKey });`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 1085 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 1098 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `const rawResponse = await window.electronAPI.generateInfomaniak({ apiKey, payload: translatedPayload, productId });`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 1103 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `response = await window.electronAPI.generateGemini({ apiKey, payload, model });`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 1328 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `sourceObj.path = (window.electronAPI && window.electronAPI.getPathForFile) ? window.electronAPI.getPathForFile(firstFile) : firstFile.path;`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 1328 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `sourceObj.path = (window.electronAPI && window.electronAPI.getPathForFile) ? window.electronAPI.getPathForFile(firstFile) : firstFile.path;`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 1328 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `sourceObj.path = (window.electronAPI && window.electronAPI.getPathForFile) ? window.electronAPI.getPathForFile(firstFile) : firstFile.path;`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 1351 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `newSourceObj.path = (window.electronAPI && window.electronAPI.getPathForFile) ? window.electronAPI.getPathForFile(extraFile) : extraFile.path;`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 1351 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `newSourceObj.path = (window.electronAPI && window.electronAPI.getPathForFile) ? window.electronAPI.getPathForFile(extraFile) : extraFile.path;`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 1351 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `newSourceObj.path = (window.electronAPI && window.electronAPI.getPathForFile) ? window.electronAPI.getPathForFile(extraFile) : extraFile.path;`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 1435 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `const res = await window.electronAPI.fetchUrl(urlVal);`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 1488 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI && window.electronAPI.parseDocx && src.path) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 1488 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI && window.electronAPI.parseDocx && src.path) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 1489 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `const docText = await window.electronAPI.parseDocx(src.path);`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 1522 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI && window.electronAPI.uploadFileGemini && typeof src.path === 'string' && src.path !== "") {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 1522 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI && window.electronAPI.uploadFileGemini && typeof src.path === 'string' && src.path !== "") {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 1523 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `uploadedFile = await window.electronAPI.uploadFileGemini({`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 3752 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `const dataUrl = await window.electronAPI.capturePage();`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 4601 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI && window.electronAPI.openExternal) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 4601 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI && window.electronAPI.openExternal) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 4602 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `window.electronAPI.openExternal(url);`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 4870 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI && window.electronAPI.openSaveFolder) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 4870 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI && window.electronAPI.openSaveFolder) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 4872 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `await window.electronAPI.openSaveFolder();`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 4997 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `const result = await window.electronAPI.pickFolder();`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 5002 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `const saveRes = await window.electronAPI.saveVault({`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 5120 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `const result = await window.electronAPI.pickFolder();`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 5125 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `const loadRes = await window.electronAPI.loadVault(result.folderPath);`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 5307 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 5308 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `window.electronAPI.saveMapJSON(appState);`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 5955 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI && window.electronAPI.pickFile) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 5955 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI && window.electronAPI.pickFile) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 5956 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `const result = await window.electronAPI.pickFile();`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 6636 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (!window.electronAPI) return;`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 6647 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `await window.electronAPI.saveChatTranscript({`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 7281 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `if (window.electronAPI) {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 7282 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `window.electronAPI.saveMapJSON(appState);`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 8247 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `const res = await window.electronAPI.saveChatTranscript({`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 9136 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `const vaults = await window.electronAPI.getAllVaults();`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 9184 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `const loadRes = await window.electronAPI.loadVault(folderPath);`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

### 📂 [public/js/preload.js](file:///Users/giacomomeschini/Antigravity/MappAI/public/js/preload.js)

#### Linea 1 - Importazioni di Moduli Node.js Nativi (`🛑 CRITICAL`)
- **Descrizione:** I moduli nativi di Node.js non sono disponibili in ambiente browser/Capacitor su iPadOS.
- **Codice rilevato:** `require('electron'`
- **Contesto:** `const { contextBridge, ipcRenderer, webUtils } = require('electron');`
- **💡 Soluzione suggerita:** Usa API web standard o plugin nativi di Capacitor (es. @capacitor/filesystem).

#### Linea 1 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `const { contextBridge, ipcRenderer, webUtils } = require('electron');`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 3 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `electronAPI`
- **Contesto:** `contextBridge.exposeInMainWorld('electronAPI', {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 4 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `generateGemini: (data) => ipcRenderer.invoke('generate-gemini', data),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 5 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `generateInfomaniak: (data) => ipcRenderer.invoke('generate-infomaniak', data),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 6 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `listModels: (data) => ipcRenderer.invoke('list-models', data),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 7 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `listInfomaniakModels: (data) => ipcRenderer.invoke('list-infomaniak-models', data),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 8 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `saveMapJSON: (mapData) => ipcRenderer.invoke('save-map-json', mapData),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 9 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `openSaveFolder: () => ipcRenderer.invoke('open-save-folder'),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 10 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `uploadFileGemini: (data) => ipcRenderer.invoke('upload-file-gemini', data),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 12 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `parseDocx: (filePath) => ipcRenderer.invoke('parse-docx', filePath),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 13 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `pickFile: () => ipcRenderer.invoke('pick-file'),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 14 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `getMachineId: () => ipcRenderer.invoke('get-machine-id'),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 15 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `saveChatTranscript: (data) => ipcRenderer.invoke('save-chat-transcript', data),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 16 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `saveVault: (data) => ipcRenderer.invoke('save-vault', data),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 17 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `loadVault: (folderPath) => ipcRenderer.invoke('load-vault', folderPath),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 18 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `pickFolder: () => ipcRenderer.invoke('pick-folder'),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 19 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `fetchUrl: (url) => ipcRenderer.invoke('fetch-url', url),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 20 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `getAllVaults: () => ipcRenderer.invoke('get-all-vaults'),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 21 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `loadPrompts: () => ipcRenderer.invoke('load-prompts'),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 22 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `savePrompts: (data) => ipcRenderer.invoke('save-prompts', data),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 23 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `openExternal: (url) => ipcRenderer.invoke('open-external', url),`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

#### Linea 24 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `ipcRenderer`
- **Contesto:** `capturePage: () => ipcRenderer.invoke('capture-page')`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

### 📂 [public/js/storageAdapter.js](file:///Users/giacomomeschini/Antigravity/MappAI/public/js/storageAdapter.js)

#### Linea 190 - API Electron / IPC (`🛑 CRITICAL`)
- **Descrizione:** Le chiamate IPC di Electron e l'oggetto electronAPI non esistono su iPadOS.
- **Codice rilevato:** `window.electronAPI`
- **Contesto:** `window.electronAPI = {`
- **💡 Soluzione suggerita:** Sostituisci con un adattatore di storage/comunicazione (es. storageAdapter.js) che usi Capacitor quando gira su iPad.

### 📂 [test-load.js](file:///Users/giacomomeschini/Antigravity/MappAI/test-load.js)

#### Linea 1 - Importazioni di Moduli Node.js Nativi (`🛑 CRITICAL`)
- **Descrizione:** I moduli nativi di Node.js non sono disponibili in ambiente browser/Capacitor su iPadOS.
- **Codice rilevato:** `require('fs'`
- **Contesto:** `const fs = require('fs');`
- **💡 Soluzione suggerita:** Usa API web standard o plugin nativi di Capacitor (es. @capacitor/filesystem).

#### Linea 2 - Importazioni di Moduli Node.js Nativi (`🛑 CRITICAL`)
- **Descrizione:** I moduli nativi di Node.js non sono disponibili in ambiente browser/Capacitor su iPadOS.
- **Codice rilevato:** `require('path'`
- **Contesto:** `const path = require('path');`
- **💡 Soluzione suggerita:** Usa API web standard o plugin nativi di Capacitor (es. @capacitor/filesystem).

### 📂 [main.js](file:///Users/giacomomeschini/Antigravity/MappAI/main.js)

#### Linea 39 - Uso insicuro di process.platform/env (`⚠️ HIGH`)
- **Descrizione:** Il riferimento a 'process' senza controlli preventivi causa errori a runtime sui browser mobili (ReferenceError: process is not defined).
- **Codice rilevato:** `process.platform`
- **Contesto:** `if (process.platform !== 'darwin') {`
- **💡 Soluzione suggerita:** Proteggi l'accesso verificando typeof process !== 'undefined' o usa variabili d'ambiente fornite da bundler come Vite/Webpack.

#### Linea 48 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.writeFileSync`
- **Contesto:** `try { fs.writeFileSync(statusPath, JSON.stringify({ ...data, timestamp: Date.now() })); } catch(e) {}`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 251 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (!fs.existsSync(saveDir)) {`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 252 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.mkdirSync`
- **Contesto:** `fs.mkdirSync(saveDir, { recursive: true });`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 262 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.writeFileSync`
- **Contesto:** `fs.writeFileSync(filePath, JSON.stringify(mapData, null, 2), 'utf-8');`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 273 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (vaultPath && fs.existsSync(vaultPath)) {`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 280 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (!fs.existsSync(chatDir)) {`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 281 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.mkdirSync`
- **Contesto:** `fs.mkdirSync(chatDir, { recursive: true });`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 289 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `const exists = fs.existsSync(filePath);`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 306 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (!fs.existsSync(folderPath)) {`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 307 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.mkdirSync`
- **Contesto:** `fs.mkdirSync(folderPath, { recursive: true });`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 323 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.writeFileSync`
- **Contesto:** `fs.writeFileSync(path.join(folderPath, 'index.yaml'), indexYaml, 'utf-8');`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 332 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.writeFileSync`
- **Contesto:** `fs.writeFileSync(path.join(folderPath, 'links.json'), JSON.stringify(linksData, null, 2), 'utf-8');`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 337 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (!fs.existsSync(nodesDir)) fs.mkdirSync(nodesDir, { recursive: true });`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 337 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.mkdirSync`
- **Contesto:** `if (!fs.existsSync(nodesDir)) fs.mkdirSync(nodesDir, { recursive: true });`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 338 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (!fs.existsSync(allegatiDir)) fs.mkdirSync(allegatiDir, { recursive: true });`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 338 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.mkdirSync`
- **Contesto:** `if (!fs.existsSync(allegatiDir)) fs.mkdirSync(allegatiDir, { recursive: true });`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 389 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.writeFileSync`
- **Contesto:** `fs.writeFileSync(destPath, buffer);`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 399 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (fs.existsSync(cleanPath)) {`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 439 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.writeFileSync`
- **Contesto:** `fs.writeFileSync(path.join(nodesDir, fileName), frontmatter + content, 'utf-8');`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 446 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.writeFileSync`
- **Contesto:** `fs.writeFileSync(path.join(folderPath, 'fonti_e_link.txt'), summaryTxt, 'utf-8');`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 450 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.writeFileSync`
- **Contesto:** `fs.writeFileSync(path.join(folderPath, 'chat_state.json'), JSON.stringify(mapData.tutorState, null, 2), 'utf-8');`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 456 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (!fs.existsSync(studyDir)) fs.mkdirSync(studyDir, { recursive: true });`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 456 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.mkdirSync`
- **Contesto:** `if (!fs.existsSync(studyDir)) fs.mkdirSync(studyDir, { recursive: true });`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 460 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.writeFileSync`
- **Contesto:** `fs.writeFileSync(path.join(studyDir, fileName), JSON.stringify(set, null, 2), 'utf-8');`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 498 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (!fs.existsSync(folderPath)) throw new Error("Cartella non trovata");`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 508 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (fs.existsSync(indexPath)) {`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 509 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.readFileSync`
- **Contesto:** `const indexContent = fs.readFileSync(indexPath, 'utf-8');`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 527 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (fs.existsSync(tutorPath)) {`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 528 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.readFileSync`
- **Contesto:** `mapData.tutorState = JSON.parse(fs.readFileSync(tutorPath, 'utf-8'));`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 533 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (fs.existsSync(linksPath)) {`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 534 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.readFileSync`
- **Contesto:** `const rawLinks = JSON.parse(fs.readFileSync(linksPath, 'utf-8'));`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 545 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (fs.existsSync(nodesDir)) {`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 546 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.readdirSync`
- **Contesto:** `const files = fs.readdirSync(nodesDir).filter(f => f.endsWith('.md'));`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 548 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.readFileSync`
- **Contesto:** `const content = fs.readFileSync(path.join(nodesDir, file), 'utf-8');`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 610 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (fs.existsSync(studyDir)) {`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 611 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.readdirSync`
- **Contesto:** `const files = fs.readdirSync(studyDir).filter(f => f.endsWith('.json'));`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 614 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.readFileSync`
- **Contesto:** `const content = fs.readFileSync(path.join(studyDir, file), 'utf-8');`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 631 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (!fs.existsSync(saveDir)) return [];`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 633 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.readdirSync`
- **Contesto:** `const folders = fs.readdirSync(saveDir).filter(f => {`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 641 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (fs.existsSync(indexPath)) {`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 643 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.readFileSync`
- **Contesto:** `const indexContent = fs.readFileSync(indexPath, 'utf-8');`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 684 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (!fs.existsSync(saveDir)) {`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 685 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.mkdirSync`
- **Contesto:** `fs.mkdirSync(saveDir, { recursive: true });`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 824 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (fs.existsSync(defaultPromptsPath)) {`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 825 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.readFileSync`
- **Contesto:** `const data = fs.readFileSync(defaultPromptsPath, 'utf-8');`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 832 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (fs.existsSync(userPromptsPath)) {`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 833 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.readFileSync`
- **Contesto:** `const userData = fs.readFileSync(userPromptsPath, 'utf-8');`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 850 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.writeFileSync`
- **Contesto:** `fs.writeFileSync(userPromptsPath, JSON.stringify(promptsData, null, 4), 'utf-8');`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

### 📂 [test-load.js](file:///Users/giacomomeschini/Antigravity/MappAI/test-load.js)

#### Linea 13 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (fs.existsSync(indexPath)) {`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 14 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.readFileSync`
- **Contesto:** `const indexContent = fs.readFileSync(indexPath, 'utf-8');`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 22 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (fs.existsSync(linksPath)) {`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 23 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.readFileSync`
- **Contesto:** `mapData.links = JSON.parse(fs.readFileSync(linksPath, 'utf-8'));`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 27 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.exists`
- **Contesto:** `if (fs.existsSync(nodesDir)) {`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 28 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.readdirSync`
- **Contesto:** `const files = fs.readdirSync(nodesDir).filter(f => f.endsWith('.md'));`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

#### Linea 30 - Operazioni Sincrone del File System (`⚠️ HIGH`)
- **Descrizione:** Le operazioni sincrone bloccano il thread principale e non sono supportate da Capacitor Filesystem.
- **Codice rilevato:** `fs.readFileSync`
- **Contesto:** `const content = fs.readFileSync(path.join(nodesDir, file), 'utf-8');`
- **💡 Soluzione suggerita:** Usa le chiamate asincrone messe a disposizione da @capacitor/filesystem.

### 📂 [public/js/app.js](file:///Users/giacomomeschini/Antigravity/MappAI/public/js/app.js)

#### Linea 3108 - Eventi Mouse-Only (`💡 WARNING`)
- **Descrizione:** Gli eventi di hover o doppio click del mouse non si traducono bene su schermi touch.
- **Codice rilevato:** `on("contextmenu"`
- **Contesto:** `.on("contextmenu", (e) => window.showContextMenu(e, 'bg', null))`
- **💡 Soluzione suggerita:** Aggiungi il supporto per gesture touch equivalenti (es. touchstart/touchend, simulazione del long-press per il menu contestuale).

#### Linea 3286 - Eventi Mouse-Only (`💡 WARNING`)
- **Descrizione:** Gli eventi di hover o doppio click del mouse non si traducono bene su schermi touch.
- **Codice rilevato:** `on("contextmenu"`
- **Contesto:** `.on("contextmenu", (e, d) => window.showContextMenu(e, 'link', d))`
- **💡 Soluzione suggerita:** Aggiungi il supporto per gesture touch equivalenti (es. touchstart/touchend, simulazione del long-press per il menu contestuale).

#### Linea 3345 - Eventi Mouse-Only (`💡 WARNING`)
- **Descrizione:** Gli eventi di hover o doppio click del mouse non si traducono bene su schermi touch.
- **Codice rilevato:** `on("dblclick"`
- **Contesto:** `.on("dblclick", (e, d) => { e.stopPropagation(); window.openSourceModal(d.id); })`
- **💡 Soluzione suggerita:** Aggiungi il supporto per gesture touch equivalenti (es. touchstart/touchend, simulazione del long-press per il menu contestuale).

#### Linea 3346 - Eventi Mouse-Only (`💡 WARNING`)
- **Descrizione:** Gli eventi di hover o doppio click del mouse non si traducono bene su schermi touch.
- **Codice rilevato:** `on("contextmenu"`
- **Contesto:** `.on("contextmenu", (e, d) => { e.preventDefault(); e.stopPropagation(); window.showContextMenu(e, 'node', d); });`
- **💡 Soluzione suggerita:** Aggiungi il supporto per gesture touch equivalenti (es. touchstart/touchend, simulazione del long-press per il menu contestuale).

---

> Report generato automaticamente dalla skill `check-ipad-compatibility`.
