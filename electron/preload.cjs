// Puente mínimo entre la web y el proceso principal. La página no tiene acceso
// a Node: solo a estas funciones, que el proceso principal valida.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('focoDesktop', {
  platform: process.platform,
  info: () => ipcRenderer.invoke('foco:info'),
  chooseDataDir: () => ipcRenderer.invoke('foco:choose-dir'),
  openDataDir: () => ipcRenderer.invoke('foco:open-dir'),
  readData: () => ipcRenderer.invoke('foco:read-data'),
  writeData: (json) => ipcRenderer.invoke('foco:write-data', json),
  archiveData: () => ipcRenderer.invoke('foco:archive-data'),
  saveVideo: (name, data) => ipcRenderer.invoke('foco:save-video', name, data),
  readVideo: (name) => ipcRenderer.invoke('foco:read-video', name),
});
