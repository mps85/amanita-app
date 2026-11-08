const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('amanita', {
  load: () => ipcRenderer.invoke('project:load'),
  save: (project) => ipcRenderer.invoke('project:save', project),
  exportProject: (project) => ipcRenderer.invoke('project:export', project),
  importProject: () => ipcRenderer.invoke('project:import'),
});
