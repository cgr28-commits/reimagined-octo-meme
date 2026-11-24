import { constantTimeEqual, sha256Hex } from "./canonical.js";

export const MAX_FAILS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

/**
 * Owner authentication shared by the settings store and the emergency controls store (identical rules):
 * fail closed (503) if no key is configured, constant-time comparison of equal-length digests, 5 failures from one client
 * -> 15-minute lockout (429, even for the right key), counters persisted in the Durable Object's own storage.
 */
export async function authenticateOwner(state, env, request) {
  const key = env.TOURS_OWNER_KEY;
  if (typeof key !== "string" || key.length < 16) return { ok: false, status: 503, error: "owner-auth-not-configured" };
  const now = Date.now();
  const client = request.headers.get("x-client-id") || "unknown";
  const lock = (await state.storage.get(`lock:${client}`)) || { count: 0, until: 0 };
  if (lock.until > now) return { ok: false, status: 429, error: "locked-out" };
  const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const [a, b] = await Promise.all([sha256Hex(supplied), sha256Hex(key)]);
  if (constantTimeEqual(a, b)) {
    if (lock.count) await state.storage.delete(`lock:${client}`);
    return { ok: true };
  }
  const count = lock.count + 1;
  await state.storage.put(`lock:${client}`, { count, until: count >= MAX_FAILS ? now + LOCKOUT_MS : 0 });
  return { ok: false, status: 401, error: "unauthorised" };
}
