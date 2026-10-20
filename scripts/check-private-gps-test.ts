import assert from "node:assert/strict";
import { handlePrivateGpsTest } from "../workers/addresses/src/private-gps-test";

async function main() {
  const data = new Map<string, string>();
  const store = {
    async get(key: string, type?: string) { const value = data.get(key); return value === undefined ? null : type === "json" ? JSON.parse(value) : value; },
    async put(key: string, value: string) { data.set(key, value); },
    async delete(key: string) { data.delete(key); },
    async list() { return { keys: [], list_complete: true }; },
  };
  const env = { TRACKING_STORE: store as unknown as KVNamespace, OWNER_ACCESS_KEY: "test-owner" };
  const url = "https://test.invalid/owner/private-gps-test";
  const post = (body: unknown, authorized = true) => handlePrivateGpsTest(new Request(url, { method: "POST", headers: { "Content-Type": "application/json", ...(authorized ? { "X-Owner-Key": "test-owner" } : {}) }, body: JSON.stringify(body) }), env, null);
  assert.equal((await post({ action: "create" }, false)).status, 401);
  const created = await (await post({ action: "create" })).json() as { token: string; expiresAt: number };
  assert.match(created.token, /^[a-f0-9]{32}$/);
  assert.ok(created.expiresAt > Date.now());
  assert.equal(data.size, 2, "No day, booking or payment index is written");
  const upload = await post({ action: "location", token: created.token, lat: 54.597, lng: -5.93, accuracy: 10 });
  assert.equal(upload.status, 200);
  const uploaded = await upload.json() as { stored: boolean };
  assert.equal(uploaded.stored, true);
  const view = async () => handlePrivateGpsTest(new Request(`${url}?token=${created.token}`), env, null);
  const location = await (await view()).json() as { driver: { lat: number }; pointCount: number };
  assert.equal(location.driver.lat, 54.597);
  assert.equal(location.pointCount, 1);
  const realToken = "a".repeat(32);
  data.set(`track:job:${realToken}`, "real-job-sentinel");
  assert.equal((await post({ action: "stop", token: realToken })).status, 410);
  assert.equal(data.get(`track:job:${realToken}`), "real-job-sentinel");
  assert.equal((await post({ action: "stop", token: created.token })).status, 200);
  assert.equal((await view()).status, 410);
  assert.equal((await post({ action: "location", token: created.token, lat: 54, lng: -5 })).status, 410);
  assert.equal(data.size, 1, "All temporary GPS data deleted; real-job sentinel remains");
  const expiring = await (await post({ action: "create" })).json() as { token: string };
  data.set(`private-gps-test:${expiring.token}`, JSON.stringify({ expiresAt: Date.now() - 1 }));
  assert.equal((await post({ action: "location", token: expiring.token, lat: 54, lng: -5 })).status, 410);
  console.log("PASS private GPS test: owner auth, actual ingestion, viewer, expiry, cleanup, real-booking isolation. No external calls.");
}
void main();
