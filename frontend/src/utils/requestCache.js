// In-memory TTL cache for recently loaded list data (e.g. complaints). Lets the
// UI reuse the last successful response for an identical query so switching
// between dashboard tabs never re-fires the same request or flashes a spinner.

const DEFAULT_TTL_MS = 30 * 1000;
const MAX_ENTRIES = 200;

// Stable string key for a request: method + URL + (sorted) params.
// Empty / undefined params are dropped so "search cleared" equals "no search".
export const buildCacheKey = (method, url, params) => {
  let key = `${method || 'GET'} ${url}`;
  if (params) {
    let query = '';
    try {
      const clean = Object.keys(params)
        .sort()
        .reduce((acc, k) => {
          const v = params[k];
          if (v !== undefined && v !== null && v !== '') acc[k] = v;
          return acc;
        }, {});
      query = JSON.stringify(clean);
    } catch {
      query = JSON.stringify(params);
    }
    if (query !== '{}') key += ` ${query}`;
  }
  return key;
};

export const createCacheStore = ({ ttlMs = DEFAULT_TTL_MS, maxEntries = MAX_ENTRIES } = {}) => {
  const store = new Map();
  const now = () => Date.now();

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) return undefined;
      return entry.value;
    },
    set(key, value, ttl = ttlMs) {
      if (store.has(key)) store.delete(key);
      store.set(key, { value, cachedAt: now(), expiresAt: now() + ttl });
      while (store.size > maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest === undefined) break;
        store.delete(oldest);
      }
    },
    isFresh(key, maxAgeMs = ttlMs) {
      const entry = store.get(key);
      if (!entry) return false;
      if (entry.expiresAt <= now()) return false;
      return now() - entry.cachedAt <= maxAgeMs;
    },
    peek(key) {
      const entry = store.get(key);
      return entry ? entry.value : undefined;
    },
    clear(key) {
      if (key === undefined) store.clear();
      else store.delete(key);
    },
    get size() {
      return store.size;
    },
  };
};

export const requestCache = createCacheStore();
