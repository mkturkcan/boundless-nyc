// boundless.js NYC server — the page's side of the host bridge. boundlessjs/src/api/bridge.js finds
// window.boundlessHost and routes every API request and sensor event through it.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('boundlessHost', {
  onRequest: (cb) => ipcRenderer.on('api-request', (_e, req) => cb(req)),
  onDisconnect: (cb) => ipcRenderer.on('api-disconnect', (_e, cid) => cb(cid)),
  respond: (msg) => ipcRenderer.send('api-response', msg),
  emit: (meta, blobs) => ipcRenderer.send('api-event', meta, blobs || []),
  ready: (info) => ipcRenderer.send('api-ready', info),
});
