import { markMeasurementUnavailable } from "./measurement-availability";
/** Irrevocable, strongly consistent withdrawal tombstones; no customer/click data. */
const PREFIX = "measurement:withdrawn:";
const RETENTION_MS = 180 * 86400_000;
export class ConsentLedger implements DurableObject {
  constructor(private readonly ctx: DurableObjectState) {}
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && path === "/withdraw") {
      await this.ctx.blockConcurrencyWhile(async () => {
        if ((await this.ctx.storage.get<number>("withdrawnAt")) === undefined) {
          const now = Date.now();
          await this.ctx.storage.put("withdrawnAt", now);
          await this.ctx.storage.setAlarm(now + RETENTION_MS);
        }
      });
      return Response.json({ revoked: true });
    }
    if (request.method === "GET" && path === "/status")
      return Response.json({ revoked: (await this.ctx.storage.get("withdrawnAt")) !== undefined });
    return new Response(null, { status: 405 });
  }
  async alarm(): Promise<void> { await this.ctx.storage.deleteAll(); }
}

/** Preserve the existing KV interface, but never rely on a cached KV absence to override a strong denial.
 * All other operational booking/payment reads and writes pass through unchanged.
 * Missing/unavailable ledger throws: callers already fail closed for measurement.
 */
export function withConsistentConsentLedger(
  store: KVNamespace | undefined,
  namespace: DurableObjectNamespace | undefined,
): KVNamespace | undefined {
  if (!store) return;
  const stubFor = (key: string) => {
    const id = key.slice(PREFIX.length);
    if (!namespace || !/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Consent ledger unavailable");
    return namespace.get(namespace.idFromName(id));
  };
  const wrapped = new Proxy(store, {
    get(target, property) {
      if (property === "get") return async (key: string, ...args: unknown[]) => {
        if (!key.startsWith(PREFIX)) return Reflect.apply(target.get, target, [key, ...args]);
        try {
          const response = await stubFor(key).fetch("https://consent.internal/status");
          if (!response.ok) throw new Error("Consent check unavailable");
          const body = await response.json() as { revoked?: unknown };
          if (typeof body.revoked !== "boolean") throw new Error("Invalid consent status");
          if (body.revoked) return "1";
          // Honour existing legacy denials during the coordinated cutover as well.
          return (await Reflect.apply(target.get, target, [key])) ? "1" : null;
        } catch (error) { markMeasurementUnavailable(wrapped); throw error; }
      };
      if (property === "put") return async (key: string, ...args: unknown[]) => {
        if (!key.startsWith(PREFIX)) return Reflect.apply(target.put, target, [key, ...args]);
        const response = await stubFor(key).fetch("https://consent.internal/withdraw", { method: "POST" });
        if (!response.ok || (await response.json() as { revoked?: unknown }).revoked !== true)
          throw new Error("Withdrawal not acknowledged");
        // Optional shadow for compatibility; never authoritative for eligibility.
        try { await Reflect.apply(target.put, target, [key, ...args]); } catch { /* strong denial is committed */ }
      };
      if (property === "delete") return async (key: string) => {
        if (key.startsWith(PREFIX)) throw new Error("Withdrawals cannot be reversed");
        return target.delete(key);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return wrapped;
}
