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
        clientId: 'bc25f0fc-5cbb-4de4-8cee-eab8bc24dff2',
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: 'https://mystique611.github.io/Abyss/'

    },
    cache: {
        cacheLocation: 'localStorage', // MSAL needs this to persist the session across reloads
        storeAuthStateInCookie: false
    }
};

const GRAPH_SCOPES = ['Files.ReadWrite', 'offline_access', 'User.Read'];

let msalInstance = null;
let activeAccount = null;

/** True when running as an installed/home-screen PWA (standalone display
 *  mode) rather than a normal browser tab. Popups are unreliable there —
 *  iOS in particular can throw MSAL's "block_nested_popups" error the
 *  moment loginPopup() tries to open the Microsoft sign-in window from
 *  inside a standalone webview, since iOS's window-management model for
 *  installed PWAs doesn't support real child popup windows the way a
 *  normal Safari/Chrome tab does. Detecting this up front and going
 *  straight to a full-page redirect sidesteps the failure entirely instead
 *  of relying on a catch-and-retry after the popup attempt has already
 *  failed. */
function isRunningAsInstalledPWA() {
    return (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
        window.navigator.standalone === true; // iOS Safari-specific flag
}

function getMsalInstance() {
    if (typeof msal === 'undefined') {
        // The MSAL library (js/msal-browser.min.js) didn't load — e.g. the
        // service worker hasn't cached it yet and the device is offline, or
        // something blocked the request. Surface a clear, actionable error
        // instead of letting callers hit a raw "Can't find variable: msal".
        throw new Error(
            "Couldn't load the sign-in library (msal-browser.min.js). " +
            "This usually means no internet connection was available the " +
            "first time this device opened the app. Connect to the " +
            "internet and reload, then try signing in again."
        );
    }
    if (!msalInstance) {
        msalInstance = new msal.PublicClientApplication(MSAL_CONFIG);
    }
    return msalInstance;
}

/** Call once on app startup. Handles the redirect-back-from-login case and
 *  restores any already-signed-in account from cache. */
async function initAuth() {
    const instance = getMsalInstance();

    // .initialize() was introduced in MSAL v3 and isn't present in v2 (the
    // version this app loads, since Microsoft deprecated CDN hosting for
    // v3+). Guard so this works correctly against the CDN-available v2 API.
    if (typeof instance.initialize === 'function') {
        await instance.initialize();
    }

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
    if (MSAL_CONFIG.auth.clientId === 'REPLACE_WITH_YOUR_AZURE_APP_CLIENT_ID') {
        throw new Error(
            "OneDrive sign-in isn't configured yet: js/auth.js still has the placeholder " +
            "clientId. Register an app at portal.azure.com and paste your Application " +
            "(client) ID into MSAL_CONFIG.auth.clientId in js/auth.js — see README.md."
        );
    }

    const instance = getMsalInstance();

    // Installed/standalone PWA (e.g. added to the home screen on iOS): skip
    // the popup attempt entirely and go straight to a full-page redirect.
    // See isRunningAsInstalledPWA() above for why — attempting loginPopup()
    // here is what produces the "block_nested_popups" failure.
    if (isRunningAsInstalledPWA()) {
        await instance.loginRedirect({ scopes: GRAPH_SCOPES });
        return null; // page will reload after redirect; initAuth() picks it up
    }

    try {
        const result = await instance.loginPopup({ scopes: GRAPH_SCOPES });
        activeAccount = result.account;
        return activeAccount;
    } catch (popupError) {
        // Don't retry via redirect if the user simply closed/cancelled the
        // popup themselves — only fall back when the popup couldn't open at
        // all (blocked by the browser, or MSAL refused to nest it), which is
        // a different failure mode.
        const isUserCancelled = popupError && (
            popupError.errorCode === 'user_cancelled' ||
            popupError.errorCode === 'popup_window_error' && /closed/i.test(popupError.errorMessage || '')
        );
        if (isUserCancelled) {
            throw popupError;
        }

        try {
            await instance.loginRedirect({ scopes: GRAPH_SCOPES });
            return null; // page will reload after redirect; initAuth() picks it up
        } catch (redirectError) {
            console.error('Both popup and redirect sign-in failed:', { popupError, redirectError });
            throw redirectError;
        }
    }
}

async function signOut() {
    const instance = getMsalInstance();
    if (activeAccount) {
        if (isRunningAsInstalledPWA()) {
            // Same popup restriction as sign-in applies here — redirect instead.
            await instance.logoutRedirect({ account: activeAccount }).catch(() => {});
        } else {
            await instance.logoutPopup({ account: activeAccount }).catch(() => {
                // Popup logout can fail silently on some browsers — clear local state anyway
            });
        }
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
        // interactive fallback, but never block a UI action on this.
        try {
            if (isRunningAsInstalledPWA()) {
                // acquireTokenPopup() hits the same standalone-PWA popup
                // restriction as loginPopup(). Redirect instead; the page
                // will reload and initAuth()/acquireTokenSilent() will pick
                // the refreshed token up from there. Nothing meaningful to
                // return synchronously in this branch.
                await instance.acquireTokenRedirect({ scopes: GRAPH_SCOPES, account: activeAccount });
                return null;
            }
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
