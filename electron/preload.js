const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rsmElectron', {
  isElectron: true,
  listSerialPorts: () => ipcRenderer.invoke('serial:list'),
  connectSerial: (path, baudRate) => ipcRenderer.invoke('serial:connect', { path, baudRate }),
  disconnectSerial: (path) => ipcRenderer.invoke('serial:disconnect', { path }),
  writeSerial: (path, data, options) => ipcRenderer.invoke('serial:write', { path, data, atomic: options?.atomic === true }),
  setSerialBaud: (path, baudRate) => ipcRenderer.invoke('serial:setBaud', { path, baudRate }),
  getSerialStatus: () => ipcRenderer.invoke('serial:status'),
  onSerialData: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('serial:data', handler);
    return () => ipcRenderer.removeListener('serial:data', handler);
  },
  onSerialDisconnected: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('serial:disconnected', handler);
    return () => ipcRenderer.removeListener('serial:disconnected', handler);
  },
  onSerialError: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('serial:error', handler);
    return () => ipcRenderer.removeListener('serial:error', handler);
  },
});
