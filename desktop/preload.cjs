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
  getDesktopSettings: () => {
    return ipcRenderer.invoke('get-desktop-settings');
  },
  setDesktopSettings: (settings) => {
    return ipcRenderer.invoke('set-desktop-settings', settings);
  },
  onAppAction: (callback) => {
    ipcRenderer.on('app-action', (_event, action) => callback(action));
  },
  onAppUpdate: (callback) => {
    ipcRenderer.on('app-update', (_event, value) => callback(value));
  },
  onOpenEmail: (callback) => {
    ipcRenderer.on('open-email', (_event, data) => callback(data));
  }
});
