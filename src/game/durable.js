// Durable copy of the progress keys in IndexedDB.
//
// Chromium (and the Android WebView, which is Chromium) keeps localStorage writes in memory and
// commits them to disk lazily: seconds to about a minute later. If the app is swiped away or the
// process is killed inside that window, the next launch reads the old values and the last session
// is gone. A completed IndexedDB transaction is already handed to the OS, so it survives a process
// kill. Every save of a progress key is mirrored here, and at boot the copy wins when it is newer.
//
// "Newer" is decided by a save counter kept in both stores: localStorage commits its pending writes
// as one batch, so the counter it comes back with always matches the data it comes back with.

export const PREFIX = 'synapse.v1.';
export const DURABLE_KEYS = new Set(['profile', 'settings', 'session.pending', 'onboarded']);

const DB_NAME = 'synapse';
const STORE = 'kv';
const SEQ = '__seq';
const RESTORE_TIMEOUT_MS = 1200;

let seq = 0;
let ready = null; // resolves once boot has compared both stores; mirrored writes wait for it
const queue = new Map(); // key -> raw JSON string, or null for a removal
let flushing = false;

function available() {
  try {
    return typeof indexedDB !== 'undefined' && !!indexedDB && typeof localStorage !== 'undefined' && !!localStorage;
  } catch {
    return false; // blocked site data: even reading the storage globals throws
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      const conn = req.result;
      // a connection the browser closes (storage pressure, data cleared) is reopened on the next write
      conn.onclose = () => (dbPromise = null);
      conn.onversionchange = () => {
        conn.close();
        dbPromise = null;
      };
      resolve(conn);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
}
let dbPromise = null;
const db = () =>
  (dbPromise ??= openDb().catch((err) => {
    dbPromise = null; // a failed open is retried next time instead of being cached
    throw err;
  }));

function readAll(conn) {
  return new Promise((resolve, reject) => {
    const out = {};
    const tx = conn.transaction(STORE, 'readonly');
    const cursor = tx.objectStore(STORE).openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return;
      out[c.key] = c.value;
      c.continue();
    };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
  });
}

function writeAll(conn, entries) {
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    for (const [k, v] of entries) os.put(v, k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const lsGet = (key) => localStorage.getItem(PREFIX + key);
function lsSeq() {
  const n = Number(lsGet(SEQ));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The current localStorage values of every progress key, plus the counter, ready to store. */
function snapshotEntries(withSeq) {
  const entries = [...DURABLE_KEYS].map((k) => [k, lsGet(k)]);
  entries.push([SEQ, withSeq]);
  return entries;
}

/**
 * Called once before the game modules load. If the IndexedDB copy is newer than what localStorage
 * came back with, it is written into localStorage (the game keeps reading localStorage
 * synchronously). Otherwise the copy is brought up to date. Never throws and never waits more than
 * RESTORE_TIMEOUT_MS: a slow or broken IndexedDB must not keep the game from starting. If the copy
 * turns out to be newer only after that (the game already started on the older data), it is still
 * restored and the page reloads, so the newer progress is never overwritten.
 * @returns {Promise<'restored'|'kept'|'skipped'>}
 */
export function restoreDurable() {
  if (!available()) return Promise.resolve('skipped');
  let late = false;
  const work = (async () => {
    try {
      const conn = await db();
      const saved = await readAll(conn);
      const local = lsSeq();
      const copy = Number(saved[SEQ]) || 0;
      if (copy > local) {
        for (const k of DURABLE_KEYS) {
          const v = saved[k];
          if (typeof v === 'string') localStorage.setItem(PREFIX + k, v);
          else if (v === null) localStorage.removeItem(PREFIX + k); // a recorded removal; a key the copy never had is left alone
        }
        localStorage.setItem(PREFIX + SEQ, String(copy));
        seq = copy;
        if (late) {
          queue.clear(); // writes made on the older data must not land on top of the restored copy
          globalThis.location?.reload?.();
        }
        return 'restored';
      }
      // localStorage is current: make the copy match it
      seq = Math.max(seq, local, copy) + (copy !== local ? 1 : 0);
      if (copy !== local || !(SEQ in saved)) {
        try {
          localStorage.setItem(PREFIX + SEQ, String(seq));
        } catch {
          /* storage full: the copy still gets the data */
        }
        await writeAll(conn, snapshotEntries(seq));
      }
      return 'kept';
    } catch {
      return 'skipped';
    }
  })();
  ready = work.then(() => {});
  const timeout = new Promise((resolve) =>
    setTimeout(() => {
      late = true;
      resolve('skipped');
    }, RESTORE_TIMEOUT_MS),
  );
  return Promise.race([work, timeout]);
}

async function flush() {
  if (flushing) return;
  flushing = true;
  let entries = [];
  try {
    await ready;
    while (queue.size) {
      entries = [...queue];
      queue.clear();
      await writeAll(await db(), [...entries, [SEQ, seq]]);
      entries = [];
    }
  } catch {
    // IndexedDB unusable right now: localStorage keeps working as before. What didn't make it goes
    // back in the queue (unless a newer value is already there) and the next save retries it with
    // a fresh connection; the queue holds one value per key, so nothing piles up.
    for (const [k, v] of entries) if (!queue.has(k)) queue.set(k, v);
    dbPromise = null;
  } finally {
    flushing = false;
  }
}

/**
 * Mirrors one localStorage write (raw JSON string, or null for a removal) when the key is a
 * progress key. Writes made in the same task share one IndexedDB transaction.
 */
export function mirror(key, raw) {
  if (!DURABLE_KEYS.has(key) || !available()) return;
  try {
    // continue from the stored counter: another tab of the web version may have moved it on
    seq = Math.max(seq, lsSeq()) + 1;
    localStorage.setItem(PREFIX + SEQ, String(seq));
  } catch {
    seq += 1; // storage full: the copy still gets the data
  }
  queue.set(key, raw);
  ready ??= Promise.resolve();
  if (!flushing) queueMicrotask(flush);
}
