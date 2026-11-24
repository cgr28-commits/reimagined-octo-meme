import { TourSettingsDO } from "../src/settings-do.js";
import { seedSettings } from "../src/seed.js";

export const KEY = "test-owner-key-0123456789abcdef";

/**
 * In-memory stand-in for Durable Object storage. transaction() has the same contract as Cloudflare's
 * storage.transaction(): if the callback throws, every write made inside it is rolled back.
 * failOnPut(n) makes the nth put() throw, to prove atomicity under mid-write failure.
 */
export function fakeStorage() {
  const map = new Map();
  let puts = 0;
  let failAt = null;
  const api = {
    map,
    failOnPut(n) { failAt = puts + n; },
    async get(k) { return map.has(k) ? structuredClone(map.get(k)) : undefined; },
    async put(k, v) {
      puts += 1;
      if (failAt !== null && puts === failAt) { failAt = null; throw new Error("injected storage failure"); }
      map.set(k, structuredClone(v));
    },
    async transaction(fn) {
      const snapshot = new Map([...map].map(([k, v]) => [k, structuredClone(v)]));
      try { return await fn(api); } catch (error) { map.clear(); for (const [k, v] of snapshot) map.set(k, v); throw error; }
    },
    async delete(k) { if (Array.isArray(k)) { let n = 0; for (const key of k) if (map.delete(key)) n += 1; return n; } return map.delete(k); },
    async list({ prefix = "" } = {}) {
      const out = new Map();
      for (const k of [...map.keys()].sort()) if (k.startsWith(prefix)) out.set(k, structuredClone(map.get(k)));
      return out;
    },
  };
  return api;
}

export function makeDO(env = { TOURS_OWNER_KEY: KEY, TOURS_ENVIRONMENT: "staging" }) {
  const storage = fakeStorage();
  const stub = new TourSettingsDO({ storage }, env);
  const call = async (method, path, body, { key = KEY, client = "t1" } = {}) => {
    const headers = { "x-client-id": client };
    if (key !== null) headers.authorization = `Bearer ${key}`;
    const res = await stub.fetch(new Request(`https://x.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
  return { call, storage, stub };
}

export const fresh = () => seedSettings();
/** Open every launch gate with evidence (used only to test gated behaviour). */
export function withOpenGates(s) {
  for (const g of Object.values(s.gates)) { g.verified = true; g.evidenceRef = "TEST-EVIDENCE-1"; }
  return s;
}
