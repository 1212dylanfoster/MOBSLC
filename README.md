# Company Browser

Chromium (Electron) shell where Microsoft Entra ID sign-in is the only way in.

## Run
    npm install
    BROWSER_CLIENT_ID=... BROWSER_TENANT_ID=... npm start
    npm run dist        # installers for MDM (Intune/Jamf)

## Entra setup
1. App registrations > New: single tenant, platform "Mobile and desktop applications", redirect URI `http://localhost`.
2. App roles: add `Browser.Admin` (allowed member type: Users). Assign it to your admin group under Enterprise applications.
3. Conditional Access: require MFA and a compliant device for this app.

## Before production
- Replace the placeholder `whitelist` entries in `src/config.js` with your real work pages. Admins can also edit the whitelist in the Admin panel. Microsoft sign-in domains are always allowed.
- Point `BROWSER_POLICY_URL` at a policy service that re-validates the `Browser.Admin` role on every POST. Without it, the policy is saved only on that PC.
- Request an API scope for your policy service instead of `User.Read`.
- Code-sign builds, keep Electron updated (security patches), and enforce server-side that internal apps accept only tokens from this browser.

## Whitelist
Employees can open only whitelisted pages; everything else is blocked and the toolbar explains why. Each entry is `Name | host` or `Name | host/path` (for example `HR portal | yourtenant.sharepoint.com/sites/hr`). Entries appear as shortcut buttons under the address bar. Path rules limit which page can be opened; files and scripts a page loads from the same host are still allowed so pages don't break.

## Automatic builds and releases (GitHub Actions)
Every push to `main` builds a Windows installer and two macOS disk images (`arm64` for Apple Silicon, `x64` for Intel). When both builds pass, a new release is published on the repo's **Releases** page with all three files attached, versioned `0.1.<build number>`. To start a new version series, change `version` in `package.json` (for example to `0.2.0`). Pull requests are built but not released. Builds are unsigned until you add code-signing certificates as repository secrets.
