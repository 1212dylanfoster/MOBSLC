const { contextBridge, ipcRenderer } = require("electron");
const inv = (c, ...a) => ipcRenderer.invoke(c, ...a);
contextBridge.exposeInMainWorld("api", {
  signIn: (silent) => inv("auth:signin", !!silent),
  signOut: () => inv("auth:signout"),
  newTab: (url) => inv("tab:new", url),
  closeTab: (id) => inv("tab:close", id),
  activate: (id) => inv("tab:activate", id),
  nav: (action, value) => inv("nav", action, value),
  overlay: (on) => inv("overlay", on),
  getPolicy: () => inv("policy:get"),
  getLinks: () => inv("policy:links"),
  savePolicy: (p) => inv("policy:save", p),
  onTabs: (cb) => ipcRenderer.on("tabs", (_, s) => cb(s)),
  onBlocked: (cb) => ipcRenderer.on("blocked", (_, host) => cb(host)),
  onLocked: (cb) => ipcRenderer.on("locked", () => cb()),
});
