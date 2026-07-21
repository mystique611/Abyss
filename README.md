# Abyss Dive Log — PWA with Offline Storage + OneDrive Sync

This app works fully offline (IndexedDB), and syncs to the signed-in user's
personal OneDrive whenever a connection is available. It's a static site —
no backend server required — so it deploys for free on GitHub Pages.

## File overview

```
index.html          the app itself
manifest.json        PWA metadata (install prompt, icons, theme color)
service-worker.js    caches the app shell so it boots with zero connectivity
js/db.js             IndexedDB wrapper — local source of truth for all data
js/auth.js           Microsoft login (MSAL.js) — OneDrive access
js/sync.js           pushes/pulls data to the user's OneDrive app folder
icons/               placeholder app icons (replace with your own artwork)
```

## 1. Register an Azure AD app (one-time, ~5 minutes)

1. Go to https://portal.azure.com → **App registrations** → **New registration**
2. Name it anything (e.g. "Abyss Dive Log")
3. **Supported account types** → "Accounts in any organizational directory and personal Microsoft accounts"
4. **Redirect URI** → platform: **Single-page application (SPA)**, URI:
   `https://<your-username>.github.io/<your-repo-name>/`
   (must match your GitHub Pages URL *exactly*, including the trailing slash and any repo-name path)
5. After creation, copy the **Application (client) ID** from the Overview page
6. Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions** → add `Files.ReadWrite`
   (`User.Read` and `offline_access` are included by default)
7. Open `js/auth.js` and paste your client ID into `MSAL_CONFIG.auth.clientId`

The app only ever requests access to its own sandboxed app folder in OneDrive
(`/Apps/AbyssDiveLog/`) — not the user's full drive.

## 2. Deploy to GitHub Pages

1. Create a new **public** GitHub repo and push these files to it
2. Repo → **Settings** → **Pages** → Source: deploy from the `main` branch, `/ (root)` folder
3. Wait a minute for the first deploy, then visit `https://<your-username>.github.io/<your-repo-name>/`
4. If your Azure redirect URI doesn't match this exact URL, sign-in will fail with a `redirect_uri_mismatch` error — go back and fix it in step 1.5 above.

Optional: attach a custom domain under Pages settings (free, automatic HTTPS) —
just remember to update the Azure redirect URI to match if you do.

## 3. Test it

- **Offline test**: open the deployed site once (to cache the app shell), then turn on airplane mode and reload — the app should still fully load and let you log dives.
- **Sync test**: sign in via the header button, log a dive, then open the same URL on a second device/browser and sign in with the same account — your data should appear after a sync.
- **Install test**: on Android Chrome or desktop Chrome/Edge, you should see an "Install" prompt/icon in the address bar. On iOS Safari, use Share → "Add to Home Screen".

## How the offline + sync flow works

1. Every write (new dive, edited profile, theme toggle) goes to **IndexedDB** first, instantly, regardless of connectivity.
2. Each write also adds an entry to a `syncQueue` — a simple "something changed" flag.
3. Whenever the browser comes online (or every 60s as a backup check, or on manual tap of the sync button), `sync.js`:
   - Gets a Graph API token (silently, if already signed in)
   - Downloads whatever's currently in the OneDrive app folder
   - Compares timestamps and keeps whichever copy (local or remote) is newer
   - Uploads the winning copy back to OneDrive
   - Uploads any pending photos as separate files
4. If the *remote* copy wins (e.g. you logged dives on your phone while this device was offline), the newer data is pulled back into this device's IndexedDB and the UI refreshes automatically.

## Known platform limitations (not bugs — browser constraints)

- **iOS Safari** has no Background Sync API, so sync only runs while the app is actively open (not silently while backgrounded). It also may clear IndexedDB after ~7 days of inactivity unless the user "installs" the app to their home screen — encourage users to do this.
- **Conflict resolution** here is last-write-wins on the whole dataset, which is fine for one person syncing across their own devices, but isn't built for multiple people editing simultaneously.
- The two placeholder icons in `icons/` are generated programmatically — swap them for real artwork before shipping.
