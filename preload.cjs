// preload.cjs - güvenli IPC köprüsü
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('postaci', {
  version: '1.0.5',
  platform: process.platform,
  db: {
    stats: () => ipcRenderer.invoke('db:stats'),
  },
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    add: (acc) => ipcRenderer.invoke('accounts:add', acc),
    addManual: (acc) => ipcRenderer.invoke('accounts:add-manual', acc),
    update: (id, updates) => ipcRenderer.invoke('accounts:update', id, updates),
    delete: (id) => ipcRenderer.invoke('accounts:delete', id),
    get: (id) => ipcRenderer.invoke('accounts:get', id),
  },
  auth: {
    start: (provider) => ipcRenderer.invoke('auth:start', provider),
  },
  mail: {
    sync: (email) => ipcRenderer.invoke('mail:sync', email),
    syncFolder: (email, folderPath) => ipcRenderer.invoke('mail:sync-folder', email, folderPath),
    folders: (email) => ipcRenderer.invoke('mail:folders', email),
    list: (email, folderPath, limit, offset) => ipcRenderer.invoke('mail:list', email, folderPath, limit, offset),
    count: (email, folderPath) => ipcRenderer.invoke('mail:count', email, folderPath),
    listUnified: (limit, offset) => ipcRenderer.invoke('mail:list-unified', limit, offset),
    countUnified: () => ipcRenderer.invoke('mail:count-unified'),
    searchUnified: (query) => ipcRenderer.invoke('mail:search-unified', query),
    syncAllInboxes: () => ipcRenderer.invoke('mail:sync-all-inboxes'),
    exportEml: (email, folderPath, uid) => ipcRenderer.invoke('mail:export-eml', email, folderPath, uid),
    emptyTrash: (email) => ipcRenderer.invoke('mail:empty-trash', email),
    syncMore: (email, folderPath, beforeUid, limit) => ipcRenderer.invoke('mail:sync-more', email, folderPath, beforeUid, limit),
    search: (email, folderPath, query) => ipcRenderer.invoke('mail:search', email, folderPath, query),
    thread: (email, folderPath, messageId) => ipcRenderer.invoke('mail:thread', email, folderPath, messageId),
    markRead: (email, folderPath, uid) => ipcRenderer.invoke('mail:mark-read', email, folderPath, uid),
    star: (email, folderPath, uid) => ipcRenderer.invoke('mail:star', email, folderPath, uid),
    delete: (email, folderPath, uid) => ipcRenderer.invoke('mail:delete', email, folderPath, uid),
    autoconfig: (email) => ipcRenderer.invoke('mail:autoconfig', email),
    body: (email, folderPath, uid) => ipcRenderer.invoke('mail:body', email, folderPath, uid),
    markUnread: (email, folderPath, uid) => ipcRenderer.invoke('mail:mark-unread', email, folderPath, uid),
    send: (msg) => ipcRenderer.invoke('mail:send', msg),
    replyTemplate: (email, folderPath, uid) => ipcRenderer.invoke('mail:reply-template', email, folderPath, uid),
    forwardTemplate: (email, folderPath, uid) => ipcRenderer.invoke('mail:forward-template', email, folderPath, uid),
    attachments: (email, folderPath, uid) => ipcRenderer.invoke('mail:attachments', email, folderPath, uid),
    attachmentSave: (email, folderPath, uid, index) => ipcRenderer.invoke('mail:attachment-save', email, folderPath, uid, index),
    attachmentPreview: (email, folderPath, uid, index) => ipcRenderer.invoke('mail:attachment-preview', email, folderPath, uid, index),
    batchDelete: (email, folderPath, uids) => ipcRenderer.invoke('mail:batch-delete', email, folderPath, uids),
    batchMarkRead: (email, folderPath, uids, isRead) => ipcRenderer.invoke('mail:batch-mark-read', email, folderPath, uids, isRead),
    batchStar: (email, folderPath, uids, starred) => ipcRenderer.invoke('mail:batch-star', email, folderPath, uids, starred),
    saveDraft: (args) => ipcRenderer.invoke('mail:save-draft', args),
    moveToFolder: (email, fromFolder, toFolder, uid) => ipcRenderer.invoke('mail:move-to-folder', email, fromFolder, toFolder, uid),
    batchMoveToFolder: (email, fromFolder, toFolder, uids) => ipcRenderer.invoke('mail:batch-move-to-folder', email, fromFolder, toFolder, uids),
    archive: (email, folderPath, uid) => ipcRenderer.invoke('mail:archive', email, folderPath, uid),
    batchArchive: (email, folderPath, uids) => ipcRenderer.invoke('mail:batch-archive', email, folderPath, uids),
  },
  contacts: {
    search: (query) => ipcRenderer.invoke('contacts:search', query),
  },
  notifications: {
    getSettings: () => ipcRenderer.invoke('notifications:get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('notifications:save-settings', settings),
    test: () => ipcRenderer.invoke('notifications:test'),
    onOpenMessage: (callback) => {
      const listener = (_evt, data) => callback(data);
      ipcRenderer.on('notify:open-message', listener);
      return () => ipcRenderer.removeListener('notify:open-message', listener);
    },
    onBackgroundSynced: (callback) => {
      const listener = (_evt, data) => callback(data);
      ipcRenderer.on('notify:background-synced', listener);
      return () => ipcRenderer.removeListener('notify:background-synced', listener);
    },
  },
  appSettings: {
    get: () => ipcRenderer.invoke('app:get-settings'),
    save: (settings) => ipcRenderer.invoke('app:save-settings', settings),
  },
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
});
