// Persistence layer. Everything goes through an adapter so a future backend
// (accounts, sync, leaderboards) can replace localStorage without touching game code.

const PREFIX = 'synapse.v1.';

export class LocalStorageAdapter {
  load(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  save(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
  remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* storage unavailable */
    }
  }
}

/** In-memory adapter (tests, private mode fallback). */
export class MemoryAdapter {
  constructor() {
    this.data = new Map();
  }
  load(key, fallback) {
    return this.data.has(key) ? structuredClone(this.data.get(key)) : fallback;
  }
  save(key, value) {
    this.data.set(key, structuredClone(value));
    return true;
  }
  remove(key) {
    this.data.delete(key);
  }
}

let adapter = typeof localStorage !== 'undefined' ? new LocalStorageAdapter() : new MemoryAdapter();

export const storage = {
  use(newAdapter) {
    adapter = newAdapter;
  },
  load: (key, fallback) => adapter.load(key, fallback),
  save: (key, value) => adapter.save(key, value),
  remove: (key) => adapter.remove(key),
};
