/**
 * db.js — IndexedDB wrapper for the Abyss Dive Log PWA.
 *
 * This is the app's single source of truth for data. The UI reads/writes here
 * FIRST (works fully offline), and sync.js separately mirrors changes to
 * OneDrive whenever a connection + signed-in session are available.
 *
 * Object stores:
 *   - meta        key/value store for small settings (theme, diverProfile, lastSyncedAt)
 *   - dives       one record per logged dive, keyed by `id`. Critter/dive
 *                 photos live OUT of this store (see `photos` below) —
 *                 dive/critter records only hold a `photoId` reference, so
 *                 the dive_data.json snapshot synced to OneDrive stays a
 *                 small text file no matter how many photos get attached.
 *   - photos      local cache of actual photo bytes, keyed by `id` (a
 *                 generated `photo-<ts>-<rand>` string). Record shape:
 *                 { id, dataUrl, updatedAt }. This is a CACHE, not the
 *                 source of truth for photos across devices — the source of
 *                 truth is the individual file at
 *                 /Apps/AbyssDiveLog/photos/<id>.jpg on OneDrive (see
 *                 sync.js uploadPhoto/downloadPhoto). A photo referenced by
 *                 a dive but missing from this store gets lazily
 *                 downloaded and re-cached here the first time it's
 *                 displayed (see index.html's getPhotoDataUrl()).
 *   - sightings   UNUSED — an earlier design considered storing critter
 *                 sightings independently of dives; nothing in index.html
 *                 reads or writes this store. Left in place only so an
 *                 existing user's DB_VERSION 1 database doesn't need a
 *                 disruptive migration; harmless dead weight.
 *   - syncQueue   pending changes waiting to be pushed to OneDrive, auto-incrementing key
 */

const DB_NAME = 'abyss_dive_log_db';
const DB_VERSION = 2;

let _dbPromise = null;

function openDB() {
    if (_dbPromise) return _dbPromise;

    _dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains('meta')) {
                db.createObjectStore('meta', { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains('dives')) {
                db.createObjectStore('dives', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('sightings')) {
                db.createObjectStore('sightings', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('syncQueue')) {
                db.createObjectStore('syncQueue', { keyPath: 'queueId', autoIncrement: true });
            }
            // Added in DB_VERSION 2 — see "photos" in the store list above.
            if (!db.objectStoreNames.contains('photos')) {
                db.createObjectStore('photos', { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });

    return _dbPromise;
}

function tx(storeName, mode = 'readonly') {
    return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

/* ---------------- Generic helpers ---------------- */

async function dbGetAll(storeName) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function dbPut(storeName, value) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
        const req = store.put(value);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function dbDelete(storeName, key) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function dbClear(storeName) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

/* ---------------- meta (key/value) ---------------- */

async function getMeta(key, fallback = null) {
    const store = await tx('meta');
    return new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : fallback);
        req.onerror = () => reject(req.error);
    });
}

async function setMeta(key, value) {
    return dbPut('meta', { key, value });
}

/* ---------------- dives ---------------- */

async function getAllDives() {
    return dbGetAll('dives');
}

async function putDive(dive) {
    dive.updatedAt = Date.now();
    return dbPut('dives', dive);
}

async function replaceAllDives(divesArray) {
    await dbClear('dives');
    for (const dive of divesArray) {
        await dbPut('dives', dive);
    }
}

/* ---------------- photos (local cache, keyed by generated photo id) ---------------- */

async function getPhoto(id) {
    if (!id) return null;
    const store = await tx('photos');
    return new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result ? req.result.dataUrl : null);
        req.onerror = () => reject(req.error);
    });
}

async function putPhoto(id, dataUrl) {
    return dbPut('photos', { id, dataUrl, updatedAt: Date.now() });
}

async function deletePhoto(id) {
    return dbDelete('photos', id);
}

/* ---------------- sync queue ---------------- */
// Every meaningful write calls enqueueSync() with a small description of what
// changed. sync.js drains this queue (in order) whenever it gets a chance to
// talk to OneDrive. Because this app syncs the *whole* dataset as one JSON
// file (simplest reliable approach for a small personal dataset), each queue
// entry mostly just acts as a "dirty flag" — sync.js only needs to know
// "something changed, push a fresh copy" rather than replay every entry.
//
// enqueueSync() also bumps `localDataVersion` in meta — a timestamp that only
// ever changes when a real local edit happens (new/edited/deleted dive,
// profile update, theme change). sync.js uses THIS as the snapshot's
// updatedAt when comparing against the remote copy, instead of stamping
// Date.now() fresh on every sync attempt. That distinction matters: if every
// sync attempt got a brand-new "now" timestamp regardless of whether
// anything actually changed, then opening the app on a second device (with
// zero local dives) would always look "newer" than the real data already on
// OneDrive, and last-write-wins would pick the empty local copy — silently
// overwriting/hiding the real data. Only bumping this on genuine changes
// keeps that comparison honest.

async function enqueueSync(action, payload = {}) {
    await setMeta('localDataVersion', Date.now());
    return dbPut('syncQueue', {
        action,          // e.g. 'dives-updated', 'profile-updated', 'theme-updated'
        payload,
        createdAt: Date.now()
    });
}

async function getLocalDataVersion() {
    return getMeta('localDataVersion', 0);
}

async function setLocalDataVersion(timestamp) {
    return setMeta('localDataVersion', timestamp);
}

async function getSyncQueue() {
    return dbGetAll('syncQueue');
}

async function clearSyncQueue() {
    return dbClear('syncQueue');
}

// Removes just one entry (by its auto-incrementing queueId), instead of
// wiping the whole queue. Used by syncNow() so a photo upload that fails
// mid-sync (bad connection, etc.) stays queued for the next attempt instead
// of being discarded along with the entries that actually succeeded.
async function deleteSyncQueueEntry(queueId) {
    return dbDelete('syncQueue', queueId);
}

/* Exposed as a single global so index.html can call window.AbyssDB.* without
   needing ES module imports (keeps this drop-in simple for GitHub Pages). */
window.AbyssDB = {
    getMeta,
    setMeta,
    getAllDives,
    putDive,
    replaceAllDives,
    getPhoto,
    putPhoto,
    deletePhoto,
    enqueueSync,
    getSyncQueue,
    clearSyncQueue,
    deleteSyncQueueEntry,
    getLocalDataVersion,
    setLocalDataVersion,
    dbGetAll,
    dbPut,
    dbDelete
};
