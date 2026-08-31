const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  sendNotification: (title, body, emailId, accountId) => {
    ipcRenderer.send('notify', { title, body, emailId, accountId });
  },
  setBadgeCount: (count) => {
    ipcRenderer.send('set-badge', count);
  },
  openExternal: (url) => {
    ipcRenderer.send('open-external', url);
  },
  openOAuthWindow: (url) => {
    return ipcRenderer.invoke('open-oauth-window', url);
  },
  getDesktopSettings: () => {
    return ipcRenderer.invoke('get-desktop-settings');
  },
  setDesktopSettings: (settings) => {
    return ipcRenderer.invoke('set-desktop-settings', settings);
  },
  onAppAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('app-action', listener);
    return () => ipcRenderer.removeListener('app-action', listener);
  },
  onAppUpdate: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('app-update', listener);
    return () => ipcRenderer.removeListener('app-update', listener);
  },
  onOpenEmail: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('open-email', listener);
    return () => ipcRenderer.removeListener('open-email', listener);
  }
});
