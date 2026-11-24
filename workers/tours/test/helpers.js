import { TourSettingsDO } from "../src/settings-do.js";
import { seedSettings } from "../src/seed.js";

export const KEY = "test-owner-key-0123456789abcdef";

export function fakeStorage() {
  const map = new Map();
  return {
    map,
    async get(k) { return map.has(k) ? structuredClone(map.get(k)) : undefined; },
    async put(k, v) { map.set(k, structuredClone(v)); },
    async delete(k) { return map.delete(k); },
    async list({ prefix = "" } = {}) {
      const out = new Map();
      for (const k of [...map.keys()].sort()) if (k.startsWith(prefix)) out.set(k, structuredClone(map.get(k)));
      return out;
    },
  };
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
