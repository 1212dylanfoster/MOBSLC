const $ = (id) => document.getElementById(id);
const lines = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);
let me = null;

function show(signedIn) {
  $("login").hidden = signedIn;
  $("shell").hidden = !signedIn;
  if (!signedIn) { $("panel").hidden = true; me = null; }
}
function loginMessage(text, isError) {
  $("login-msg").textContent = text;
  $("login-msg").className = isError ? "err" : "";
}
async function enter(result) {
  if (!result || result.error) {
    if (result?.error) loginMessage(`Sign-in failed: ${result.error}`, true);
    return false;
  }
  me = result;
  $("who").textContent = me.name || me.user;
  $("admin").hidden = !me.isAdmin;
  show(true);
  await renderLinks();
  await api.newTab(); 
  return true;
}

async function renderLinks() {
  const chips = $("chips");
  chips.replaceChildren();
  for (const l of await api.getLinks()) {
    const b = document.createElement("button");
    b.className = "chip"; b.textContent = l.name; b.title = l.pattern;
    b.onclick = () => api.nav("go", l.pattern);
    chips.append(b);
  }
}
let noticeTimer;
api.onBlocked((host) => {
  $("notice").textContent = `${host} isn't on the approved list. Ask your IT admin to add it.`;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $("notice").textContent = ""; }, 7000);
});

$("signin").onclick = async () => {
  $("signin").disabled = true;
  loginMessage("Waiting for Microsoft sign-in in your browser...");
  const ok = await enter(await api.signIn(false));
  if (!ok && !$("login-msg").classList.contains("err")) loginMessage("Sign-in was cancelled. Try again when you're ready.");
  $("signin").disabled = false;
};
$("signout").onclick = () => api.signOut();
$("back").onclick = () => api.nav("back");
$("forward").onclick = () => api.nav("forward");
$("reload").onclick = () => api.nav("reload");
$("address").onkeydown = (e) => { if (e.key === "Enter" && e.target.value.trim()) api.nav("go", e.target.value.trim()); };

api.onLocked(() => { show(false); loginMessage("Your session ended. Sign in again to continue.", false); });
api.onTabs(({ tabs, activeId }) => {
  const bar = $("tabbar");
  bar.replaceChildren();
  for (const t of tabs) {
    const el = document.createElement("div");
    el.className = "tab" + (t.id === activeId ? " on" : "");
    el.onclick = () => api.activate(t.id);
    const title = document.createElement("span");
    title.textContent = t.title; // textContent: page titles are untrusted
    const x = document.createElement("button");
    x.className = "x"; x.textContent = "\u00d7"; x.setAttribute("aria-label", "Close tab");
    x.onclick = (e) => { e.stopPropagation(); api.closeTab(t.id); };
    el.append(title, x); bar.append(el);
    if (t.id === activeId && document.activeElement !== $("address")) $("address").value = t.url;
  }
  const add = document.createElement("button");
  add.className = "newtab"; add.textContent = "+"; add.setAttribute("aria-label", "New tab");
  add.onclick = () => api.newTab();
  bar.append(add);
});

// Admin panel (the main process re-checks the admin role on every call)
$("admin").onclick = async () => {
  const p = await api.getPolicy();
  if (!p) return;
  $("allowed").value = p.whitelist.map((e) => `${e.name} | ${e.pattern}`).join("\n");
  $("blocked").value = p.blockedDomains.join("\n");
  $("downloads").checked = p.downloads;
  $("devtools").checked = p.devTools;
  $("panel-msg").textContent = "";
  $("panel").hidden = false;
  api.overlay(true);
};
$("panel-close").onclick = () => { $("panel").hidden = true; api.overlay(false); };
$("panel-save").onclick = async () => {
  const msg = $("panel-msg");
  try {
    await api.savePolicy({ whitelist: lines($("allowed").value).map((l) => { const [n, ...r] = l.split("|"); const p = (r.join("|") || n).trim(); return { name: r.length ? n.trim() : p, pattern: p }; }), blockedDomains: lines($("blocked").value), downloads: $("downloads").checked, devTools: $("devtools").checked });
    msg.className = ""; msg.textContent = "Policy saved. It applies to all new requests now.";
    await renderLinks();
  } catch (e) { msg.className = "err"; msg.textContent = e.message; }
};

// Try a silent sign-in from the cached session first.
(async () => { await enter(await api.signIn(true)); })();
