import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { makeDO, fresh, KEY } from "./helpers.js";
import { snapshotHash, verifySnapshot, canonicalize } from "../src/canonical.js";
import worker from "../src/index.js";

const publishBody = (settings, baseVersion, reason = "Owner change") => ({ settings, baseVersion, reason });

test("server-side owner authentication: missing, wrong and unconfigured keys are refused", async () => {
  const { call } = makeDO();
  assert.equal((await call("GET", "/settings", undefined, { key: null })).status, 401);
  assert.equal((await call("GET", "/settings", undefined, { key: "wrong" })).status, 401);
  assert.equal((await call("GET", "/settings")).status, 200);
  const none = makeDO({ TOURS_ENVIRONMENT: "staging" });
  assert.equal((await none.call("GET", "/settings")).status, 503); // fail closed
  const short = makeDO({ TOURS_OWNER_KEY: "short", TOURS_ENVIRONMENT: "staging" });
  assert.equal((await short.call("GET", "/settings")).status, 503);
});
test("repeated wrong keys lock the client out, even with the right key afterwards", async () => {
  const { call } = makeDO();
  for (let i = 0; i < 5; i += 1) assert.equal((await call("GET", "/settings", undefined, { key: "bad" + i, client: "attacker" })).status, 401);
  assert.equal((await call("GET", "/settings", undefined, { key: KEY, client: "attacker" })).status, 429);
  assert.equal((await call("GET", "/settings", undefined, { key: KEY, client: "someone-else" })).status, 200);
});
test("seed is version 1 with an integrity hash", async () => {
  const { call } = makeDO();
  const r = await call("GET", "/settings");
  assert.equal(r.body.version, 1);
  assert.equal(r.body.hash, await snapshotHash(1, r.body.settings));
});
test("publish creates a new immutable version; old versions are unchanged", async () => {
  const { call } = makeDO();
  const v1 = (await call("GET", "/versions/1")).body;
  const s = fresh(); s.commercial.quotes.validityDays.value = 10;
  const pub = await call("POST", "/publish", publishBody(s, 1));
  assert.equal(pub.status, 201);
  assert.equal(pub.body.version, 2);
  const again = (await call("GET", "/versions/1")).body;
  assert.deepEqual(again, v1);
  assert.equal((await call("GET", "/settings")).body.settings.commercial.quotes.validityDays.value, 10);
  const list = (await call("GET", "/versions")).body;
  assert.equal(list.current, 2);
  assert.equal(list.versions.length, 2);
});
test("no endpoint can edit or delete a stored version", async () => {
  const { call } = makeDO();
  for (const [m, p] of [["PUT", "/versions/1"], ["DELETE", "/versions/1"], ["PATCH", "/settings"], ["DELETE", "/audit"], ["PUT", "/settings"]]) {
    const r = await call(m, p, {});
    assert.equal(r.status, 405, `${m} ${p}`);
  }
  assert.equal((await call("POST", "/versions/1", {})).status, 404);
});
test("optimistic concurrency: stale baseVersion gets 409 and nothing is written", async () => {
  const { call } = makeDO();
  const a = fresh(); a.commercial.quotes.validityDays.value = 9;
  const b = fresh(); b.commercial.quotes.validityDays.value = 12;
  assert.equal((await call("POST", "/publish", publishBody(a, 1))).status, 201);
  const stale = await call("POST", "/publish", publishBody(b, 1));
  assert.equal(stale.status, 409);
  assert.equal(stale.body.currentVersion, 2);
  assert.equal((await call("GET", "/settings")).body.version, 2);
});
test("two simultaneous publishes from the same base: exactly one wins", async () => {
  const { call } = makeDO();
  const a = fresh(); a.commercial.quotes.validityDays.value = 9;
  const b = fresh(); b.commercial.quotes.validityDays.value = 12;
  const [x, y] = await Promise.all([call("POST", "/publish", publishBody(a, 1)), call("POST", "/publish", publishBody(b, 1))]);
  assert.deepEqual([x.status, y.status].sort(), [201, 409]);
  assert.equal((await call("GET", "/versions")).body.versions.length, 2);
});
test("publish needs baseVersion and a reason", async () => {
  const { call } = makeDO();
  assert.equal((await call("POST", "/publish", { settings: fresh(), reason: "x reason" })).status, 400);
  assert.equal((await call("POST", "/publish", { settings: fresh(), baseVersion: 1 })).status, 400);
  assert.equal((await call("POST", "/publish", publishBody(fresh(), 1, "no"))).status, 400);
});
test("invalid settings are rejected (422) and not stored; rejection is audited", async () => {
  const { call } = makeDO();
  const bad = fresh(); bad.mandatory.capacity.maxPassengers = 7;
  const r = await call("POST", "/publish", publishBody(bad, 1));
  assert.equal(r.status, 422);
  assert.equal((await call("GET", "/versions")).body.versions.length, 1);
  assert.ok((await call("GET", "/audit")).body.entries.some((e) => e.action === "publish-rejected"));
});
test("validate endpoint reports errors and warnings without writing", async () => {
  const { call } = makeDO();
  const s = fresh(); s.commercial.cruise.terminals.push("7-seater pickup");
  const r = await call("POST", "/validate", { settings: s });
  assert.equal(r.body.valid, false);
  assert.equal((await call("GET", "/versions")).body.versions.length, 1);
});
test("audited rollback appends a new version and never rewrites history", async () => {
  const { call } = makeDO();
  const a = fresh(); a.commercial.quotes.validityDays.value = 9;
  await call("POST", "/publish", publishBody(a, 1));
  const rb = await call("POST", "/rollback", { baseVersion: 2, targetVersion: 1, reason: "Revert to seed" });
  assert.equal(rb.status, 201);
  assert.equal(rb.body.version, 3);
  assert.equal(rb.body.restoredFrom, 1);
  const cur = (await call("GET", "/settings")).body;
  assert.equal(cur.settings.commercial.quotes.validityDays.value, 7);
  assert.equal((await call("GET", "/versions/2")).body.settings.commercial.quotes.validityDays.value, 9); // history intact
  const entries = (await call("GET", "/audit")).body.entries;
  const last = entries[entries.length - 1];
  assert.equal(last.action, "rollback");
  assert.equal(last.detail.restoredFrom, 1);
  assert.equal(last.detail.reason, "Revert to seed");
});
test("rollback: stale base 409, unknown target 404, reason required, tampered snapshot refused", async () => {
  const { call, storage } = makeDO();
  await call("GET", "/settings");
  assert.equal((await call("POST", "/rollback", { baseVersion: 5, targetVersion: 1, reason: "valid reason" })).status, 409);
  assert.equal((await call("POST", "/rollback", { baseVersion: 1, targetVersion: 9, reason: "valid reason" })).status, 404);
  assert.equal((await call("POST", "/rollback", { baseVersion: 1, targetVersion: 1, reason: "" })).status, 400);
  const rec = storage.map.get("v:00000001");
  rec.settings.commercial.quotes.validityDays.value = 1; // tamper
  const r = await call("POST", "/rollback", { baseVersion: 1, targetVersion: 1, reason: "valid reason" });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "integrity-failure");
});
test("audit log is append-only with increasing sequence and records every action", async () => {
  const { call } = makeDO();
  const a = fresh(); a.commercial.quotes.validityDays.value = 9;
  await call("POST", "/publish", publishBody(a, 1));
  await call("POST", "/publish", publishBody(a, 1)); // conflict
  await call("POST", "/rollback", { baseVersion: 2, targetVersion: 1, reason: "Revert to seed" });
  const { entries } = (await call("GET", "/audit")).body;
  assert.deepEqual(entries.map((e) => e.action), ["seed", "publish", "publish-conflict", "rollback"]);
  assert.deepEqual(entries.map((e) => e.seq), [1, 2, 3, 4]);
  assert.ok(entries.every((e) => e.actor && e.at));
  assert.ok(!JSON.stringify(entries).includes(KEY));
});
test("immutable pricing snapshot: version id + integrity hash over the complete settings", async () => {
  const { call } = makeDO();
  const snap = (await call("GET", "/settings")).body;
  assert.equal(await verifySnapshot({ version: snap.version, settings: snap.settings }, snap.hash), true);
  const tampered = structuredClone(snap.settings); tampered.commercial.tours[0].publishedPricePence = 1;
  assert.equal(await verifySnapshot({ version: snap.version, settings: tampered }, snap.hash), false);
  assert.equal(await verifySnapshot({ version: snap.version + 1, settings: snap.settings }, snap.hash), false); // version is covered
  assert.equal(await verifySnapshot(null, snap.hash), false);
  assert.equal(await verifySnapshot({ version: 1, settings: snap.settings }, undefined), false);
  const v = (await call("POST", "/verify", { version: 1 })).body;
  assert.equal(v.intact, true);
  assert.equal((await call("POST", "/verify", { version: 1, hash: "0".repeat(64) })).body.intact, false);
});
test("canonical JSON is key-order independent", async () => {
  assert.equal(canonicalize({ b: 1, a: [2, { d: 1, c: 2 }] }), canonicalize({ a: [2, { c: 2, d: 1 }], b: 1 }));
  assert.equal(await snapshotHash(1, { a: 1, b: 2 }), await snapshotHash(1, { b: 2, a: 1 }));
  assert.throws(() => canonicalize({ a: NaN }));
});
test("oversized and malformed bodies are rejected", async () => {
  const { call, stub } = makeDO();
  assert.equal((await call("POST", "/validate", { settings: fresh(), pad: "x".repeat(300000) })).status, 400);
  const res = await stub.fetch(new Request("https://x.test/validate", { method: "POST", headers: { authorization: `Bearer ${KEY}`, "x-client-id": "t" }, body: "{not json" }));
  assert.equal(res.status, 400);
});

// ---- Worker entry: staging only, route allowlist ----
test("worker refuses to run outside the staging environment and exposes only allowlisted routes", async () => {
  const stubFetch = async () => new Response("{}");
  const env = (e) => ({ TOURS_ENVIRONMENT: e, TOUR_SETTINGS: { idFromName: () => "id", get: () => ({ fetch: stubFetch }) } });
  const req = (m, p) => new Request(`https://w.test${p}`, { method: m });
  assert.equal((await worker.fetch(req("GET", "/health"), env("staging"))).status, 200);
  assert.equal((await worker.fetch(req("GET", "/settings"), env("production"))).status, 503);
  assert.equal((await worker.fetch(req("GET", "/settings"), env(undefined))).status, 503);
  assert.equal((await worker.fetch(req("GET", "/admin"), env("staging"))).status, 404);
  assert.equal((await worker.fetch(req("DELETE", "/settings"), env("staging"))).status, 404);
  assert.equal((await worker.fetch(req("GET", "/settings"), env("staging"))).status, 200);
});
test("caller-supplied x-client-id cannot be used to dodge the lockout", async () => {
  let seen;
  const env = { TOURS_ENVIRONMENT: "staging", TOUR_SETTINGS: { idFromName: () => "id", get: () => ({ fetch: async (r) => { seen = r.headers.get("x-client-id"); return new Response("{}"); } }) } };
  await worker.fetch(new Request("https://w.test/settings", { headers: { "x-client-id": "spoofed", "cf-connecting-ip": "1.2.3.4" } }), env);
  assert.equal(seen, "1.2.3.4");
});

// ---- Isolation: no production or airport coupling in WP-B1 code ----
test("WP-B1 source has no network calls, no KV/production bindings and no airport/production references", () => {
  const dir = new URL("../src/", import.meta.url);
  for (const f of readdirSync(dir)) {
    if (f === "constants.js") continue; // holds the forbidden-pattern list itself
    const text = readFileSync(new URL(f, dir), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.ok(!/\bfetch\s*\(\s*["'`]http/.test(text), `${f} makes an outbound request`);
    assert.ok(!/(env\.[A-Z_]*KV|kv_namespace|AVAILABILITY_KV|SUMUP|STRIPE_SECRET|36c5c88df4c1f0259413d555f2679f3c)/.test(text), `${f} references a production resource`);
    for (const m of text.matchAll(/from\s+["']([^"']+)["']/g)) assert.ok(m[1].startsWith("./"), `${f} imports outside workers/tours/src: ${m[1]}`);
  }
  const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.ok(!/routes?\s*=|kv_namespaces|36c5c88df4c1f0259413d555f2679f3c/.test(wrangler));
  assert.match(wrangler, /account_id = "ecad568dc411e28a3e435ef40b36c2b5"/);
});
