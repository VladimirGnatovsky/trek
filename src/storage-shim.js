/* Provides window.storage (the persistence API Trek expects) on top of
 * localStorage, so the app keeps working outside the Claude artifact runtime.
 * Import this BEFORE the Trek component so the API exists on first render.
 *
 * Note: localStorage is capped at ~5 MB. That's fine for testing, but if you
 * scan many receipts the stored images can fill it up — for heavy use, swap
 * this for an IndexedDB-backed implementation. */
if (typeof window !== "undefined" && !window.storage) {
  const P = "trek:";
  window.storage = {
    async get(key) {
      const v = localStorage.getItem(P + key);
      return v === null ? null : { key, value: v };
    },
    async set(key, value) {
      localStorage.setItem(P + key, String(value));
      return { key, value };
    },
    async delete(key) {
      localStorage.removeItem(P + key);
      return { key, deleted: true };
    },
    async list(prefix = "") {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(P + prefix)) keys.push(k.slice(P.length));
      }
      return { keys };
    },
  };
}
