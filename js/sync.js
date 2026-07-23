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
const APP_FOLDER = 'me/drive/special/approot'; // Graph's per-app sandboxed OneDrive folder
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

        // Build the current local snapshot. updatedAt comes from
        // localDataVersion — a timestamp that only advances when a real
        // local edit happens (see db.js enqueueSync) — NOT a fresh
        // Date.now() on every sync attempt. Stamping "now" here regardless
        // of whether anything changed was the root cause of a data-loss bug:
        // a freshly-opened second device with zero local dives would always
        // look "newer" than the real data already on OneDrive, so
        // last-write-wins picked the empty local copy and hid/overwrote the
        // real one. Using the real last-edit time keeps the comparison honest.
        const localSnapshot = {
            dives: await window.AbyssDB.getAllDives(),
            diverProfile: await window.AbyssDB.getMeta('diverProfile', null),
            theme: await window.AbyssDB.getMeta('theme', 'dark'),
            updatedAt: await window.AbyssDB.getLocalDataVersion()
        };

        const remoteSnapshot = await downloadSnapshot(token);
        let winner = mergeSnapshots(localSnapshot, remoteSnapshot);

        // Belt-and-suspenders safety net, independent of the timestamp fix
        // above: this device/browser has NEVER completed a sync before
        // (e.g. storage was just cleared, or this is a brand-new device),
        // local has zero dives, and remote already has real data. Never
        // push an empty snapshot over that, no matter what any timestamp
        // says — always prefer the real data. Once this device has synced
        // successfully at least once (lastSyncedAt gets set below), this
        // guard steps aside and trusts the normal comparison, so genuinely
        // deleting all your dives on an established device still syncs fine.
        const hasSyncedBefore = await window.AbyssDB.getMeta('lastSyncedAt', null);
        const localHasNoDives = (localSnapshot.dives || []).length === 0;
        const remoteHasDives = remoteSnapshot && (remoteSnapshot.dives || []).length > 0;
        if (winner === localSnapshot && !hasSyncedBefore && localHasNoDives && remoteHasDives) {
            console.warn('Refusing to push an empty local snapshot over existing remote data on first-ever sync — pulling remote instead.');
            winner = remoteSnapshot;
        }

        if (winner === remoteSnapshot && remoteSnapshot) {
            // Remote copy is newer — pull it down so this device catches up
            // (e.g. data changed on another device, or this is a fresh
            // device signing in for the first time).
            await window.AbyssDB.replaceAllDives(remoteSnapshot.dives || []);
            await window.AbyssDB.setMeta('diverProfile', remoteSnapshot.diverProfile);
            await window.AbyssDB.setMeta('theme', remoteSnapshot.theme);
            await window.AbyssDB.setLocalDataVersion(remoteSnapshot.updatedAt || Date.now());
            if (window.onRemoteDataApplied) window.onRemoteDataApplied(remoteSnapshot);
        } else {
            // Local copy is newer (a real change happened here), or this is
            // the very first sync ever (no remote snapshot exists yet) — push it.
            await uploadSnapshot(token, winner);
        }

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

/* ---------------- Post-sign-in safe sync ---------------- */
// The riskiest moment for the "empty local device silently overwrites real
// remote data" failure mode is the very first sync a device ever does after
// signing in — local IndexedDB is empty, and if anything causes local's
// timestamp to look newer than it should, plain last-write-wins in syncNow()
// would push that emptiness over real remote data.
//
// syncAfterSignIn() sidesteps timestamps entirely for that one moment, but
// ONLY when local is genuinely empty: it downloads the remote snapshot FIRST,
// and pulls it unconditionally if local has zero dives and remote has real
// data (the classic "fresh device signing in" case, where there's nothing
// local to lose). If local already has dives of its own — e.g. a dive was
// logged while offline or signed out, before this sign-in — that data must
// be protected too, so this falls through to syncNow()'s existing
// timestamp-based comparison instead of blindly letting remote win. That
// comparison already correctly picks whichever side has the newer edit,
// since db.js only advances the local timestamp on genuine local changes.
async function syncAfterSignIn() {
    if (syncInProgress) return;
    if (!navigator.onLine) { emitStatus('offline'); return; }
    if (!window.AbyssAuth || !window.AbyssAuth.isSignedIn()) { emitStatus('signed-out'); return; }

    emitStatus('syncing');
    let pulledRemote = false;

    try {
        const token = await window.AbyssAuth.getGraphAccessToken();
        if (!token) { emitStatus('signed-out'); return; }

        const localDives = await window.AbyssDB.getAllDives();
        const localHasDives = (localDives || []).length > 0;

        const remoteSnapshot = await downloadSnapshot(token);
        const remoteHasDives = remoteSnapshot && (remoteSnapshot.dives || []).length > 0;

        // Unconditional remote-wins shortcut — safe ONLY because local has
        // nothing of its own to protect here.
        if (remoteHasDives && !localHasDives) {
            syncInProgress = true;
            await window.AbyssDB.replaceAllDives(remoteSnapshot.dives || []);
            await window.AbyssDB.setMeta('diverProfile', remoteSnapshot.diverProfile);
            await window.AbyssDB.setMeta('theme', remoteSnapshot.theme);
            await window.AbyssDB.setLocalDataVersion(remoteSnapshot.updatedAt || Date.now());
            await window.AbyssDB.clearSyncQueue();
            await window.AbyssDB.setMeta('lastSyncedAt', Date.now());
            if (window.onRemoteDataApplied) window.onRemoteDataApplied(remoteSnapshot);
            emitStatus('synced');
            pulledRemote = true;
        }
    } catch (err) {
        console.error('Post-sign-in sync check failed:', err);
        emitStatus('error', err.message);
        return;
    } finally {
        if (pulledRemote) syncInProgress = false;
    }

    if (!pulledRemote) {
        // Remote is missing/empty, OR local already has real dives to
        // protect (e.g. logged while offline/signed-out) — either way, fall
        // through to the normal timestamp-based compare-and-push flow, which
        // correctly picks whichever side actually has the newer data instead
        // of letting remote win by default.
        await syncNow();
    }
}

/* ---------------- Auto-sync triggers ---------------- */
// Sync is meant to fire only when there's an actual reason to: a real local
// change (new/edited dive, profile update — see the direct syncNow() calls
// right after those writes in index.html), or reconnecting with a change
// that was queued while offline. There's deliberately no blind interval
// polling here — that burned battery/data for no reason and wasn't what
// "sync" should mean for a personal offline-first log.

async function initAutoSync() {
    window.addEventListener('online', async () => {
        // Only push if something actually changed while we were offline —
        // reconnecting by itself isn't a change worth syncing over.
        const queue = await window.AbyssDB.getSyncQueue();
        if (queue.length > 0) syncNow();
    });
    window.addEventListener('offline', () => emitStatus('offline'));

    // One check on startup, if already signed in: this is what makes
    // opening the app on another device (or after reinstalling) pick up
    // whatever's already on OneDrive, since a fresh device has nothing
    // local to have "changed" yet.
    //
    // This branch also covers the mobile/redirect sign-in flow: the popup
    // fallback does a full-page redirect back to the app, so the very first
    // time this device learns it's signed in is right here on the reload —
    // not via the button-click handler in index.html. If this device has
    // never completed a sync before, treat it exactly like a fresh sign-in
    // and use the safe pull-first path instead of timestamp-based
    // last-write-wins, since local is empty and has nothing legitimate to
    // protect yet.
    if (navigator.onLine && window.AbyssAuth && window.AbyssAuth.isSignedIn()) {
        const hasSyncedBefore = await window.AbyssDB.getMeta('lastSyncedAt', null);
        if (hasSyncedBefore) {
            syncNow();
        } else {
            syncAfterSignIn();
        }
    }
}

window.AbyssSync = {
    syncNow,
    syncAfterSignIn,
    initAutoSync,
    onSyncStatusChange
};
