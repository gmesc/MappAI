const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    generateGemini: (data) => ipcRenderer.invoke('generate-gemini', data),
    listModels: (data) => ipcRenderer.invoke('list-models', data),
    saveMapJSON: (mapData) => ipcRenderer.invoke('save-map-json', mapData),
    openSaveFolder: () => ipcRenderer.invoke('open-save-folder'),
    uploadFileGemini: (data) => ipcRenderer.invoke('upload-file-gemini', data),
    getPathForFile: (file) => webUtils.getPathForFile(file),
    parseDocx: (filePath) => ipcRenderer.invoke('parse-docx', filePath),
    pickFile: () => ipcRenderer.invoke('pick-file'),
    getMachineId: () => ipcRenderer.invoke('get-machine-id'),
    saveChatTranscript: (data) => ipcRenderer.invoke('save-chat-transcript', data),
    saveVault: (data) => ipcRenderer.invoke('save-vault', data),
    loadVault: (folderPath) => ipcRenderer.invoke('load-vault', folderPath),
    pickFolder: () => ipcRenderer.invoke('pick-folder'),
    fetchUrl: (url) => ipcRenderer.invoke('fetch-url', url)
});
