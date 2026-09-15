'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('reviewBank', {
  request: (route, body) => ipcRenderer.invoke('review-bank-request', route, body),
  close: () => ipcRenderer.send('review-bank-close'),
  closeFailed: () => ipcRenderer.invoke('review-bank-close-failed'),
  onClosing: callback => ipcRenderer.on('review-bank-closing', () => callback())
});
