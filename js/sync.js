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
 * Conflict rule: merged dive-by-dive (see mergeSnapshots). Each dive keeps
 * whichever copy has the newer `updatedAt`; dives that only exist on one
 * side are kept; deletions travel as tombstones (`deletedDives`: id ->
 * deletedAt) so a dive deleted on one device doesn't come back from
 * another. The diver profile is last-write-wins on its own timestamp.
 * Good for one person syncing across their own devices; not built for
 * concurrent multi-user editing.
 */

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const APP_FOLDER = 'me/drive/special/approot'; // Graph's per-app sandboxed OneDrive folder
const SNAPSHOT_PATH = 'dive_data.json';

let syncInProgress = false;
let retryTimer = null;
const SYNC_RETRY_DELAY_MS = 2 * 60 * 1000;
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

// Fetches one photo back down from OneDrive as a data URL, for whenever a
// dive/critter/avatar photo is referenced locally (by id) but hasn't been
// cached in this browser's IndexedDB yet — e.g. a photo added on another
// device, or a fresh install pulling down an existing snapshot. Returns
// null (not a thrown error) on a 404, since "this device just doesn't have
// it yet and neither does OneDrive" is a normal, recoverable case for
// callers to fall back on (show a placeholder) rather than treat as fatal.
async function downloadPhoto(token, photoId) {
    const res = await graphFetch(`:/photos/${photoId}.jpg:/content`, token);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Photo download failed: ${res.status}`);

    const blob = await res.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/* ---------------- Merge logic ---------------- */

function mergeSnapshots(local, remote) {
    if (!remote) return local;
    if (!local) return remote;

    // Snapshot-level timestamp is only a tie-breaker now — for dives saved
    // before per-dive updatedAt existed (both sides 0), and for the theme.
    const remoteNewer = (remote.updatedAt || 0) > (local.updatedAt || 0);

    const deletedDives = { ...(local.deletedDives || {}) };
    Object.entries(remote.deletedDives || {}).forEach(([id, ts]) => {
        deletedDives[id] = Math.max(deletedDives[id] || 0, ts || 0);
    });

    const byId = new Map();
    (local.dives || []).forEach(d => byId.set(d.id, d));
    (remote.dives || []).forEach(r => {
        const l = byId.get(r.id);
        if (!l) { byId.set(r.id, r); return; }
        const lu = l.updatedAt || 0;
        const ru = r.updatedAt || 0;
        if (ru > lu || (ru === lu && remoteNewer)) byId.set(r.id, r);
    });
    // A dive edited (or restored via Undo) after it was deleted elsewhere
    // wins over the tombstone; otherwise the deletion sticks.
    const dives = [...byId.values()].filter(d => !(deletedDives[d.id] && deletedDives[d.id] >= (d.updatedAt || 0)));

    const lp = local.profileUpdatedAt || 0;
    const rp = remote.profileUpdatedAt || 0;
    const useRemoteProfile = remote.diverProfile && (!local.diverProfile || rp > lp || (rp === lp && remoteNewer));

    return {
        dives,
        deletedDives,
        diverProfile: useRemoteProfile ? remote.diverProfile : local.diverProfile,
        profileUpdatedAt: Math.max(lp, rp),
        theme: remoteNewer ? (remote.theme || local.theme) : (local.theme || remote.theme),
        updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0)
    };
}

// Key-order-independent JSON, so two snapshots holding the same data
// compare equal no matter how each side's objects were built.
function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value === undefined ? null : value);
}

function snapshotContent(snap) {
    if (!snap) return '';
    const dives = [...(snap.dives || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return stableStringify({ dives, deletedDives: snap.deletedDives || {}, diverProfile: snap.diverProfile || null });
}

async function readLocalSnapshot() {
    return {
        dives: await window.AbyssDB.getAllDives(),
        deletedDives: await window.AbyssDB.getMeta('deletedDives', {}),
        diverProfile: await window.AbyssDB.getMeta('diverProfile', null),
        profileUpdatedAt: await window.AbyssDB.getMeta('profileUpdatedAt', 0),
        theme: await window.AbyssDB.getMeta('theme', 'dark'),
        updatedAt: await window.AbyssDB.getLocalDataVersion()
    };
}

async function applySnapshotLocally(snap) {
    await window.AbyssDB.replaceAllDives(snap.dives || []);
    await window.AbyssDB.setMeta('deletedDives', snap.deletedDives || {});
    if (snap.diverProfile) await window.AbyssDB.setMeta('diverProfile', snap.diverProfile);
    await window.AbyssDB.setMeta('profileUpdatedAt', snap.profileUpdatedAt || 0);
    if (snap.theme) await window.AbyssDB.setMeta('theme', snap.theme);
    await window.AbyssDB.setLocalDataVersion(snap.updatedAt || Date.now());
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

        // localSnapshot.updatedAt comes from localDataVersion — a timestamp
        // that only advances on a real local edit (see db.js enqueueSync),
        // never a fresh Date.now() per sync attempt. With the per-dive merge
        // below it's only a tie-breaker, but keeping it honest still matters
        // for legacy dives that have no updatedAt of their own.
        //
        // The old whole-snapshot last-write-wins needed a special guard so
        // an empty, never-synced device couldn't push its emptiness over
        // real remote data. The merge makes that impossible by design: a
        // dive only disappears through an explicit deletedDives tombstone,
        // so an empty local side simply contributes nothing.
        const localSnapshot = await readLocalSnapshot();
        const remoteSnapshot = await downloadSnapshot(token);
        const merged = mergeSnapshots(localSnapshot, remoteSnapshot);
        const mergedContent = snapshotContent(merged);

        if (mergedContent !== snapshotContent(localSnapshot)) {
            // Something came in from another device — bring this one up to date.
            await applySnapshotLocally(merged);
            if (window.onRemoteDataApplied) window.onRemoteDataApplied(merged);
        }
        if (!remoteSnapshot || mergedContent !== snapshotContent(remoteSnapshot)) {
            // This device has changes OneDrive doesn't (or there's no remote
            // copy yet) — push the merged result.
            await uploadSnapshot(token, merged);
        }

        // Process each queued item individually, deleting only the ones that
        // actually finish successfully — NOT a blanket clearSyncQueue() after
        // the loop. That used to silently discard a failed photo upload's
        // queue entry right along with everything else, so despite the old
        // comment here claiming failed uploads "retry next sync", they
        // actually never did: the entry that would have triggered the retry
        // was already gone. Non-photo entries (dives-updated/profile-updated/
        // theme-updated) are pure "dirty flags" whose job is already done by
        // the snapshot upload/download above, so those are removed
        // unconditionally regardless of the photo results.
        for (const item of queue) {
            if (item.action === 'photo-pending' && item.payload && item.payload.id && item.payload.dataUrl) {
                try {
                    await uploadPhoto(token, item.payload.id, item.payload.dataUrl);
                    await window.AbyssDB.deleteSyncQueueEntry(item.queueId);
                } catch (err) {
                    console.warn(`Photo upload failed for ${item.payload.id} — left queued to retry next sync:`, err);
                }
            } else {
                await window.AbyssDB.deleteSyncQueueEntry(item.queueId);
            }
        }

        await window.AbyssDB.setMeta('lastSyncedAt', Date.now());
        clearTimeout(retryTimer);
        emitStatus('synced');
    } catch (err) {
        console.error('Sync failed:', err);
        emitStatus('error', err.message);
        // Nothing is lost (every change is already in IndexedDB and still
        // queued) — just try again in a couple of minutes instead of
        // waiting for the next edit or reconnect.
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => { if (navigator.onLine) syncNow(); }, SYNC_RETRY_DELAY_MS);
    } finally {
        syncInProgress = false;
    }
}

/* ---------------- Post-sign-in sync ---------------- */
// The first sync after signing in used to need its own pull-first path,
// because whole-snapshot last-write-wins could let an empty local logbook
// overwrite real remote data. The per-dive merge in syncNow() can't lose
// dives that way (an empty side contributes nothing, and only explicit
// tombstones remove a dive), so this is now just syncNow(). Kept as its
// own entry point so the sign-in callers don't need to change.
async function syncAfterSignIn() {
    return syncNow();
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

// Public wrapper around downloadPhoto() that handles the token acquisition
// (and the offline/signed-out cases) itself, so index.html never has to
// reach into window.AbyssAuth directly — same separation of concerns as
// syncNow()/syncAfterSignIn() already keep for the main snapshot sync.
// Returns null (never throws) on any failure — the caller (photo display
// code) always has a sensible fallback (placeholder) for "couldn't fetch".
async function fetchPhotoFromOneDrive(photoId) {
    if (!photoId) return null;
    if (!navigator.onLine) return null;
    if (!window.AbyssAuth || !window.AbyssAuth.isSignedIn()) return null;

    try {
        const token = await window.AbyssAuth.getGraphAccessToken();
        if (!token) return null;
        return await downloadPhoto(token, photoId);
    } catch (err) {
        console.warn(`Couldn't fetch photo ${photoId} from OneDrive:`, err);
        return null;
    }
}

window.AbyssSync = {
    syncNow,
    syncAfterSignIn,
    initAutoSync,
    onSyncStatusChange,
    fetchPhotoFromOneDrive
};
