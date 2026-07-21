/**
 * db.js — IndexedDB wrapper for the Abyss Dive Log PWA.
 *
 * This is the app's single source of truth for data. The UI reads/writes here
 * FIRST (works fully offline), and sync.js separately mirrors changes to
 * OneDrive whenever a connection + signed-in session are available.
 *
 * Object stores:
 *   - meta        key/value store for small settings (theme, diverProfile, lastSyncedAt)
 *   - dives       one record per logged dive, keyed by `id`
 *   - sightings   critter sightings (may include a photo as a base64 dataURL), keyed by `id`
 *   - syncQueue   pending changes waiting to be pushed to OneDrive, auto-incrementing key
 */

const DB_NAME = 'abyss_dive_log_db';
const DB_VERSION = 1;

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

/* ---------------- sync queue ---------------- */
// Every meaningful write calls enqueueSync() with a small description of what
// changed. sync.js drains this queue (in order) whenever it gets a chance to
// talk to OneDrive. Because this app syncs the *whole* dataset as one JSON
// file (simplest reliable approach for a small personal dataset), each queue
// entry mostly just acts as a "dirty flag" — sync.js only needs to know
// "something changed, push a fresh copy" rather than replay every entry.

async function enqueueSync(action, payload = {}) {
    return dbPut('syncQueue', {
        action,          // e.g. 'dives-updated', 'profile-updated', 'theme-updated'
        payload,
        createdAt: Date.now()
    });
}

async function getSyncQueue() {
    return dbGetAll('syncQueue');
}

async function clearSyncQueue() {
    return dbClear('syncQueue');
}

/* Exposed as a single global so index.html can call window.AbyssDB.* without
   needing ES module imports (keeps this drop-in simple for GitHub Pages). */
window.AbyssDB = {
    getMeta,
    setMeta,
    getAllDives,
    putDive,
    replaceAllDives,
    enqueueSync,
    getSyncQueue,
    clearSyncQueue,
    dbGetAll,
    dbPut,
    dbDelete
};
