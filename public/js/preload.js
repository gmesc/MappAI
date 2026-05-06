const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    generateGemini: (data) => ipcRenderer.invoke('generate-gemini', data),
    listModels: (data) => ipcRenderer.invoke('list-models', data),
    saveMapJSON: (mapData) => ipcRenderer.invoke('save-map-json', mapData),
    openSaveFolder: () => ipcRenderer.invoke('open-save-folder'),
    uploadFileGemini: (data) => ipcRenderer.invoke('upload-file-gemini', data),
    getPathForFile: (file) => webUtils.getPathForFile(file),
    parseDocx: (filePath) => ipcRenderer.invoke('parse-docx', filePath),
    pickFile: () => ipcRenderer.invoke('pick-file')
});
