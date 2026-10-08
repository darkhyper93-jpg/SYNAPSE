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

const available = () => typeof indexedDB !== 'undefined' && typeof localStorage !== 'undefined';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
}
let dbPromise = null;
const db = () => (dbPromise ??= openDb());

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
 * RESTORE_TIMEOUT_MS: a slow or broken IndexedDB must not keep the game from starting.
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
      if (!late && copy > local) {
        for (const k of DURABLE_KEYS) {
          const v = saved[k];
          if (typeof v === 'string') localStorage.setItem(PREFIX + k, v);
          else localStorage.removeItem(PREFIX + k);
        }
        localStorage.setItem(PREFIX + SEQ, String(copy));
        seq = copy;
        return 'restored';
      }
      // localStorage is current (or the boot already went ahead without the copy): make the copy match it
      seq = Math.max(local, copy) + (late || copy !== local ? 1 : 0);
      if (late || copy !== local || !(SEQ in saved)) {
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
  try {
    await ready;
    while (queue.size) {
      const entries = [...queue];
      queue.clear();
      entries.push([SEQ, seq]);
      await writeAll(await db(), entries);
    }
  } catch {
    queue.clear(); // IndexedDB unusable: localStorage alone keeps working as before
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
