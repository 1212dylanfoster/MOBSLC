// Fill these in (or set the env vars). See README for the Entra setup.
module.exports = {
  clientId: process.env.BROWSER_CLIENT_ID || "<APP_CLIENT_ID>",
  tenantId: process.env.BROWSER_TENANT_ID || "<TENANT_ID>",
  adminRole: "Browser.Admin",          // Entra App Role that unlocks the admin panel
  policyUrl: process.env.BROWSER_POLICY_URL || "", // optional policy service (GET/POST JSON)
  homeUrl: "https://intranet.example.com",
  scopes: ["User.Read"],
  refreshMinutes: 10,                  // silent re-check; failure locks the browser
  // Always allowed so Microsoft sign-in works inside internal apps. Not editable by admins.
  alwaysAllowed: ["login.microsoftonline.com", "login.microsoft.com", "login.live.com", "aadcdn.msauth.net", "msauth.net", "msftauth.net"],
  defaultPolicy: {
    // Whitelist: only these pages can be opened. Pattern = host, or host/path to limit to one section.
    whitelist: [
      { name: "Intranet", pattern: "intranet.example.com" },
      { name: "HR portal", pattern: "yourtenant.sharepoint.com/sites/hr" },
      { name: "Outlook", pattern: "outlook.office.com" },
      { name: "Teams", pattern: "teams.microsoft.com" },
    ],
    blockedDomains: [],
    downloads: false,
    devTools: false,
  },
};
