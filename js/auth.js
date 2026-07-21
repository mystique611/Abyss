/**
 * auth.js — Microsoft login (OneDrive access) using MSAL.js.
 *
 * SETUP REQUIRED before this works:
 *   1. Register an app at https://portal.azure.com -> "App registrations" -> "New registration"
 *      - Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
 *      - Platform: Single-page application (SPA)
 *      - Redirect URI: the exact URL this app will be hosted at, e.g.
 *          https://yourusername.github.io/dive-log-pwa/
 *   2. Copy the "Application (client) ID" into MSAL_CONFIG.auth.clientId below.
 *   3. Under "API permissions", add Microsoft Graph delegated permission: Files.ReadWrite
 *      (offline_access and User.Read are included by default).
 *
 * This app requests access ONLY to its own app folder in the user's OneDrive
 * (Graph's "special/approot" endpoint), not the user's whole drive.
 */

const MSAL_CONFIG = {
    auth: {
        clientId: 'REPLACE_WITH_YOUR_AZURE_APP_CLIENT_ID',
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: window.location.origin + window.location.pathname
    },
    cache: {
        cacheLocation: 'localStorage', // MSAL needs this to persist the session across reloads
        storeAuthStateInCookie: false
    }
};

const GRAPH_SCOPES = ['Files.ReadWrite', 'offline_access', 'User.Read'];

let msalInstance = null;
let activeAccount = null;

function getMsalInstance() {
    if (!msalInstance) {
        msalInstance = new msal.PublicClientApplication(MSAL_CONFIG);
    }
    return msalInstance;
}

/** Call once on app startup. Handles the redirect-back-from-login case and
 *  restores any already-signed-in account from cache. */
async function initAuth() {
    const instance = getMsalInstance();
    await instance.initialize();

    const response = await instance.handleRedirectPromise().catch(() => null);
    if (response && response.account) {
        activeAccount = response.account;
    } else {
        const accounts = instance.getAllAccounts();
        if (accounts.length > 0) activeAccount = accounts[0];
    }
    return activeAccount;
}

function isSignedIn() {
    return !!activeAccount;
}

function getSignedInUserName() {
    return activeAccount ? (activeAccount.name || activeAccount.username) : null;
}

/** Opens the Microsoft login popup. Falls back to full-page redirect if the
 *  popup is blocked (common on mobile browsers / iOS Safari). */
async function signIn() {
    const instance = getMsalInstance();
    try {
        const result = await instance.loginPopup({ scopes: GRAPH_SCOPES });
        activeAccount = result.account;
        return activeAccount;
    } catch (popupError) {
        // Popup blocked or unsupported (typical on mobile) — use redirect flow instead
        await instance.loginRedirect({ scopes: GRAPH_SCOPES });
        return null; // page will reload after redirect; initAuth() picks it up
    }
}

async function signOut() {
    const instance = getMsalInstance();
    if (activeAccount) {
        await instance.logoutPopup({ account: activeAccount }).catch(() => {
            // Popup logout can fail silently on some browsers — clear local state anyway
        });
    }
    activeAccount = null;
}

/** Returns a valid Graph API access token, silently refreshing if needed.
 *  Returns null if the user isn't signed in or refresh fails (caller should
 *  treat this as "can't sync right now", not a hard error). */
async function getGraphAccessToken() {
    if (!activeAccount) return null;
    const instance = getMsalInstance();

    try {
        const result = await instance.acquireTokenSilent({
            scopes: GRAPH_SCOPES,
            account: activeAccount
        });
        return result.accessToken;
    } catch (silentError) {
        // Silent refresh failed (e.g. token expired + no session) — try an
        // interactive popup as a last resort, but never block a UI action on this.
        try {
            const result = await instance.acquireTokenPopup({ scopes: GRAPH_SCOPES });
            return result.accessToken;
        } catch (interactiveError) {
            return null;
        }
    }
}

window.AbyssAuth = {
    initAuth,
    isSignedIn,
    getSignedInUserName,
    signIn,
    signOut,
    getGraphAccessToken
};
