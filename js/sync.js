/**
 * sync.js — keeps IndexedDB (local, works offline) and OneDrive (remote,
 * cross-device) in agreement.
 *
 * Strategy: this app's whole dataset (dives + profile + settings) is small
 * (personal dive log, not a multi-user database), so instead of syncing
 * record-by-record we sync ONE JSON snapshot file:
 *     /Apps/AbyssDiveLog/dive_data.json      (in the app's OneDrive folder)
 * Photos are uploaded as separate files under:
 *     /Apps/AbyssDiveLog/photos/<id>.jpg
 * so the JSON snapshot itself stays small and only stores a reference/URL.
 *
 * Conflict rule: last-write-wins by `updatedAt` timestamp. Good enough for a
 * single user syncing across their own devices; not built for concurrent
 * multi-user editing.
 */

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const APP_FOLDER = 'special/approot'; // Graph's per-app sandboxed OneDrive folder
const SNAPSHOT_PATH = 'dive_data.json';

let syncInProgress = false;
let statusListeners = [];

function onSyncStatusChange(callback) {
    statusListeners.push(callback);
}

function emitStatus(status, detail = '') {
    statusListeners.forEach(cb => cb(status, detail));
}

/* ---------------- Low-level Graph helpers ---------------- */

async function graphFetch(path, token, options = {}) {
    const res = await fetch(`${GRAPH_ROOT}/${APP_FOLDER}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(options.headers || {})
        }
    });
    return res;
}

async function downloadSnapshot(token) {
    const res = await graphFetch(`:/${SNAPSHOT_PATH}:/content`, token);
    if (res.status === 404) return null; // no remote data yet — first sync
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return res.json();
}

async function uploadSnapshot(token, snapshotObj) {
    const res = await graphFetch(`:/${SNAPSHOT_PATH}:/content`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshotObj)
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
}

async function uploadPhoto(token, photoId, dataUrl) {
    // dataUrl looks like "data:image/jpeg;base64,AAAA..." — Graph wants raw bytes
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const res = await graphFetch(`:/photos/${photoId}.jpg:/content`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: bytes
    });
    if (!res.ok) throw new Error(`Photo upload failed: ${res.status}`);
    return res.json();
}

/* ---------------- Merge logic ---------------- */

function mergeSnapshots(local, remote) {
    if (!remote) return local;
    if (!local) return remote;
    // Whole-snapshot last-write-wins, compared by a single top-level timestamp.
    return (remote.updatedAt || 0) > (local.updatedAt || 0) ? remote : local;
}

/* ---------------- Public sync entry point ---------------- */

async function syncNow() {
    if (syncInProgress) return;
    if (!navigator.onLine) { emitStatus('offline'); return; }
    if (!window.AbyssAuth || !window.AbyssAuth.isSignedIn()) { emitStatus('signed-out'); return; }

    syncInProgress = true;
    emitStatus('syncing');

    try {
        const token = await window.AbyssAuth.getGraphAccessToken();
        if (!token) { emitStatus('signed-out'); return; }

        const queue = await window.AbyssDB.getSyncQueue();

        // Build the current local snapshot
        const localSnapshot = {
            dives: await window.AbyssDB.getAllDives(),
            diverProfile: await window.AbyssDB.getMeta('diverProfile', null),
            theme: await window.AbyssDB.getMeta('theme', 'dark'),
            updatedAt: Date.now()
        };

        const remoteSnapshot = await downloadSnapshot(token);
        const winner = mergeSnapshots(localSnapshot, remoteSnapshot);

        // If the remote copy won, pull it back into IndexedDB so this device
        // catches up (e.g. data changed on another device while offline here).
        if (winner === remoteSnapshot && remoteSnapshot) {
            await window.AbyssDB.replaceAllDives(remoteSnapshot.dives || []);
            await window.AbyssDB.setMeta('diverProfile', remoteSnapshot.diverProfile);
            await window.AbyssDB.setMeta('theme', remoteSnapshot.theme);
            if (window.onRemoteDataApplied) window.onRemoteDataApplied(remoteSnapshot);
        }

        await uploadSnapshot(token, winner);

        // Flush any queued photo uploads (queue entries of type 'photo-pending')
        for (const item of queue) {
            if (item.action === 'photo-pending' && item.payload && item.payload.id && item.payload.dataUrl) {
                await uploadPhoto(token, item.payload.id, item.payload.dataUrl).catch(() => {
                    // Leave failed photo uploads in place; they'll retry next sync
                });
            }
        }

        await window.AbyssDB.clearSyncQueue();
        await window.AbyssDB.setMeta('lastSyncedAt', Date.now());
        emitStatus('synced');
    } catch (err) {
        console.error('Sync failed:', err);
        emitStatus('error', err.message);
    } finally {
        syncInProgress = false;
    }
}

/* ---------------- Auto-sync triggers ---------------- */

function initAutoSync() {
    window.addEventListener('online', syncNow);
    window.addEventListener('offline', () => emitStatus('offline'));

    // Also retry periodically in case 'online' fires before Wi-Fi actually
    // has a route to the internet (common on mobile / dive-site wifi).
    setInterval(() => { if (navigator.onLine) syncNow(); }, 60000);

    // Sync once on startup if we're online and already signed in
    if (navigator.onLine) syncNow();
}

window.AbyssSync = {
    syncNow,
    initAutoSync,
    onSyncStatusChange
};
