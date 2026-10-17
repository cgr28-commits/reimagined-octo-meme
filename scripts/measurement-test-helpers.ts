import {
  CONSENT_MAX_AGE_MS,
  MEASUREMENT_POLICY_VERSION,
  type MeasurementConsent,
} from "../shared/measurement-consent";
export function consent(
  advertising = true,
  analytics = true,
): MeasurementConsent {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    version: MEASUREMENT_POLICY_VERSION,
    recordedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CONSENT_MAX_AGE_MS).toISOString(),
    advertising,
    analytics,
    personalization: false,
  };
}
export function memoryStorage() {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, String(v));
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    keys: () => [...m.keys()],
  };
}
export function mockKv() {
  const m = new Map<string, string>();
  const ttls = new Map<string, number>();
  return {
    m,
    ttls,
    async get(k: string, type?: string) {
      const s = m.get(k);
      return s === undefined ? null : type === "json" ? JSON.parse(s) : s;
    },
    async put(k: string, v: string, o?: { expirationTtl?: number }) {
      m.set(k, v);
      if (o?.expirationTtl) ttls.set(k, o.expirationTtl);
    },
    async delete(k: string) {
      m.delete(k);
    },
    async list({ prefix = "" }: { prefix?: string } = {}) {
      return {
        keys: [...m.keys()]
          .filter((k) => k.startsWith(prefix))
          .map((name) => ({ name })),
        list_complete: true,
      };
    },
  };
}

/** Isolated, serialised Durable Object fixture; never connects to Cloudflare. */
export async function mockConsentNamespace() {
  const { ConsentLedger } = await import('../workers/addresses/src/consent-ledger');
  const instances = new Map<string, InstanceType<typeof ConsentLedger>>();
  const alarms = new Map<string, number>();
  return {
    alarms,
    idFromName: (name: string) => name,
    get(name: string) {
      if (!instances.has(name)) {
        const data = new Map<string, unknown>();
        let queue = Promise.resolve();
        const context = {
          storage: {
            get: async (key: string) => data.get(key),
            put: async (key: string, value: unknown) => { data.set(key, value); },
            setAlarm: async (at: number) => { alarms.set(name, at); },
            deleteAll: async () => { data.clear(); },
          },
          blockConcurrencyWhile<T>(fn: () => Promise<T>) {
            const next = queue.then(fn); queue = next.then(() => {}, () => {}); return next;
          },
        };
        instances.set(name, new ConsentLedger(context as unknown as DurableObjectState));
      }
      return { fetch: (url: string, init?: RequestInit) => instances.get(name)!.fetch(new Request(url, init)) };
    },
  };
}
