const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  configStatus: () => ipcRenderer.invoke('config:status'),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),

  googleSaveCreds: (clientId, clientSecret, calendarId) =>
    ipcRenderer.invoke('google:saveCreds', { clientId, clientSecret, calendarId }),
  googleConnect: () => ipcRenderer.invoke('google:connect'),
  googleDisconnect: () => ipcRenderer.invoke('google:disconnect'),
  listEvents: (timeMin, timeMax) => ipcRenderer.invoke('events:list', { timeMin, timeMax }),
  createEvent: (ev) => ipcRenderer.invoke('events:create', ev),

  notionSave: (token, databaseId) => ipcRenderer.invoke('notion:save', { token, databaseId }),
  notionDisconnect: () => ipcRenderer.invoke('notion:disconnect'),
  tasksList: () => ipcRenderer.invoke('tasks:list'),
  tasksAdd: (t) => ipcRenderer.invoke('tasks:add', t),
  tasksToggle: (id, done) => ipcRenderer.invoke('tasks:toggle', { id, done }),
  tasksDelete: (id) => ipcRenderer.invoke('tasks:delete', { id })
});
