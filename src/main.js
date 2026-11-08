const { app, BrowserWindow, WebContentsView, ipcMain, session, safeStorage, shell, Menu } = require("electron");
const { PublicClientApplication } = require("@azure/msal-node");
const fs = require("fs");
const path = require("path");
const cfg = require("./config");

const TOP = 120; // tab bar + toolbar height (px)
let win, pca, workSession, policy = normalize(cfg.defaultPolicy);
let auth = null; // { name, user, isAdmin, token }
let tabs = [], activeId = null, nextId = 1, refreshTimer;

const cacheFile = () => path.join(app.getPath("userData"), "msal.cache");
const policyFile = () => path.join(app.getPath("userData"), "policy.json");

// ---------- Policy ----------
const hostMatch = (host, d) => host === d || host.endsWith("." + d);
function parseEntry(p) { // "host" or "host/path"
  const s = String(p).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const i = s.indexOf("/");
  return i < 0 ? { host: s, path: "" } : { host: s.slice(0, i), path: s.slice(i) };
}
function cleanList(a) { return [...new Set((a || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean))]; }
function normalize(p = {}) {
  const raw = Array.isArray(p.whitelist) ? p.whitelist : (p.allowedDomains || []).map((d) => ({ name: d, pattern: d })); // old files
  const seen = new Set();
  const whitelist = raw.map((e) => {
    const { host, path } = parseEntry(e.pattern);
    return { name: String(e.name || host).trim().slice(0, 40), pattern: host + path };
  }).filter((e) => /^[a-z0-9.-]+(\/\S*)?$/.test(e.pattern) && !seen.has(e.pattern) && seen.add(e.pattern));
  return { whitelist, blockedDomains: cleanList(p.blockedDomains), downloads: !!p.downloads, devTools: !!p.devTools };
}
// navigation=true: the page being opened (host AND path rules apply).
// navigation=false: images/scripts/XHR the page loads (host rules only, or pages would break).
function isAllowed(url, navigation = true) {
  let u; try { u = new URL(url); } catch { return false; }
  if (u.protocol === "data:" || u.protocol === "blob:") return true;
  if (u.protocol !== "https:" && u.protocol !== "wss:") return false;
  const h = u.hostname;
  if (policy.blockedDomains.some((d) => hostMatch(h, d))) return false;
  if (cfg.alwaysAllowed.some((d) => hostMatch(h, d))) return true;
  return policy.whitelist.some((e) => {
    const p = parseEntry(e.pattern);
    return hostMatch(h, p.host) && (!navigation || !p.path || u.pathname.toLowerCase().startsWith(p.path));
  });
}
function notifyBlocked(url) { try { win?.webContents.send("blocked", new URL(url).host); } catch {} }
async function loadPolicy() {
  try {
    if (cfg.policyUrl && auth) {
      const r = await fetch(cfg.policyUrl, { headers: { Authorization: `Bearer ${auth.token}` } });
      if (r.ok) { policy = normalize(await r.json()); return; }
    }
    policy = normalize(JSON.parse(fs.readFileSync(policyFile(), "utf8")));
  } catch { policy = normalize(cfg.defaultPolicy); }
}

// ---------- Auth (Entra ID, Auth Code + PKCE) ----------
function createMsal() {
  const cachePlugin = {
    async beforeCacheAccess(ctx) {
      try { ctx.tokenCache.deserialize(safeStorage.decryptString(fs.readFileSync(cacheFile()))); } catch {}
    },
    async afterCacheAccess(ctx) {
      if (ctx.cacheHasChanged) fs.writeFileSync(cacheFile(), safeStorage.encryptString(ctx.tokenCache.serialize()));
    },
  };
  pca = new PublicClientApplication({
    auth: { clientId: cfg.clientId, authority: `https://login.microsoftonline.com/${cfg.tenantId}` },
    cache: { cachePlugin },
  });
}
async function signIn(silentOnly) {
  let res;
  const [account] = await pca.getTokenCache().getAllAccounts();
  if (account) { try { res = await pca.acquireTokenSilent({ account, scopes: cfg.scopes }); } catch {} }
  if (!res && !silentOnly) {
    res = await pca.acquireTokenInteractive({
      scopes: cfg.scopes, prompt: "select_account",
      openBrowser: async (url) => shell.openExternal(url),
    });
  }
  if (!res) return null;
  const roles = res.idTokenClaims?.roles ?? [];
  auth = { token: res.accessToken, name: res.account.name, user: res.account.username, isAdmin: roles.includes(cfg.adminRole) };
  await loadPolicy();
  clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => { if (!(await signIn(true).catch(() => null))) lock(); }, cfg.refreshMinutes * 60000);
  return { name: auth.name, user: auth.user, isAdmin: auth.isAdmin };
}
async function signOut() {
  for (const a of await pca.getTokenCache().getAllAccounts()) await pca.getTokenCache().removeAccount(a);
  await workSession.clearStorageData();
  lock();
}
function lock() {
  auth = null; clearInterval(refreshTimer);
  tabs.forEach((t) => { win.contentView.removeChildView(t.view); t.view.webContents.close(); });
  tabs = []; activeId = null;
  win?.webContents.send("locked");
}

// ---------- Tabs ----------
function layout() {
  const [w, h] = win.getContentSize();
  tabs.forEach((t) => {
    t.view.setBounds({ x: 0, y: TOP, width: w, height: h - TOP });
    t.view.setVisible(t.id === activeId && !overlayOn);
  });
}
let overlayOn = false;
function push() {
  win.webContents.send("tabs", {
    activeId,
    tabs: tabs.map((t) => ({ id: t.id, title: t.view.webContents.getTitle() || "New tab", url: t.view.webContents.getURL() })),
  });
}
function newTab(url) {
  if (!auth) return;
  const target = url || cfg.homeUrl;
  if (!isAllowed(target)) return notifyBlocked(target);
  const view = new WebContentsView({
    webPreferences: { session: workSession, sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: policy.devTools },
  });
  const wc = view.webContents, id = nextId++;
  wc.setWindowOpenHandler(({ url }) => { if (isAllowed(url)) newTab(url); else notifyBlocked(url); return { action: "deny" }; });
  wc.on("will-navigate", (e, u) => { if (!isAllowed(u)) { e.preventDefault(); notifyBlocked(u); } });
  for (const ev of ["page-title-updated", "did-navigate", "did-navigate-in-page"]) wc.on(ev, push);
  tabs.push({ id, view });
  win.contentView.addChildView(view);
  activeId = id; wc.loadURL(target); layout(); push();
}
function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id); if (i < 0) return;
  const [t] = tabs.splice(i, 1);
  win.contentView.removeChildView(t.view); t.view.webContents.close();
  if (activeId === id) activeId = tabs[Math.max(0, i - 1)]?.id ?? null;
  if (!tabs.length) return newTab();
  layout(); push();
}
const active = () => tabs.find((t) => t.id === activeId)?.view.webContents;

// ---------- IPC ----------
function ipc() {
  ipcMain.handle("auth:signin", async (_, silent) => {
    try { return await signIn(silent); } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle("auth:signout", signOut);
  ipcMain.handle("tab:new", (_, url) => newTab(url));
  ipcMain.handle("tab:close", (_, id) => closeTab(id));
  ipcMain.handle("tab:activate", (_, id) => { activeId = id; layout(); push(); });
  ipcMain.handle("nav", (_, action, value) => {
    const wc = active(); if (!wc || !auth) return;
    if (action === "back" && wc.canGoBack()) wc.goBack();
    if (action === "forward" && wc.canGoForward()) wc.goForward();
    if (action === "reload") wc.reload();
    if (action === "go") {
      const u = /^https?:\/\//i.test(value) ? value : `https://${value}`;
      if (isAllowed(u)) wc.loadURL(u); else notifyBlocked(u);
    }
  });
  ipcMain.handle("overlay", (_, on) => { overlayOn = !!on; layout(); });
  ipcMain.handle("policy:get", () => (auth?.isAdmin ? policy : null));
  ipcMain.handle("policy:links", () => (auth ? policy.whitelist : []));
  ipcMain.handle("policy:save", async (_, p) => {
    if (!auth?.isAdmin) throw new Error("Admin role required.");
    const next = normalize(p);
    if (cfg.policyUrl) {
      // The policy service MUST re-check the admin role on the token. Never trust the client.
      const r = await fetch(cfg.policyUrl, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` }, body: JSON.stringify(next),
      });
      if (!r.ok) throw new Error(`Policy service rejected the change (${r.status}).`);
    } else fs.writeFileSync(policyFile(), JSON.stringify(next, null, 2));
    policy = next; return policy;
  });
}

// ---------- Boot ----------
app.whenReady().then(() => {
  if (!app.requestSingleInstanceLock()) return app.quit();
  Menu.setApplicationMenu(null); // removes default devtools/reload shortcuts
  createMsal(); ipc();

  workSession = session.fromPartition("persist:work");
  workSession.webRequest.onBeforeRequest((d, cb) => {
    const top = d.resourceType === "mainFrame";
    const ok = !!auth && isAllowed(d.url, top);
    if (!ok && auth && top) notifyBlocked(d.url);
    cb({ cancel: !ok });
  });
  workSession.setPermissionRequestHandler((_, __, cb) => cb(false));
  workSession.on("will-download", (e) => { if (!policy.downloads) e.preventDefault(); });

  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 720, minHeight: 480, title: "Company Browser",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, devTools: false },
  });
  win.loadFile(path.join(__dirname, "index.html"));
  win.on("resize", layout);
  win.webContents.on("will-navigate", (e) => e.preventDefault());
});
app.on("window-all-closed", () => app.quit());
