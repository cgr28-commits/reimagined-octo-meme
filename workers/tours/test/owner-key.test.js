import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { TourSettingsDO } from "../src/settings-do.js";
import worker from "../src/index.js";
import { fakeStorage } from "./helpers.js";
import { planOwnerKey, keyId, readDeployedMarker, MARKER_BINDING } from "../../../scripts/tours-owner-key.mjs";

const KEY = "persistent-staging-owner-key-0123456789abcdef";
const SCRIPT = new URL("../../../scripts/tours-owner-key.mjs", import.meta.url).pathname;

test("owner key plan fails closed when the dedicated secret is missing or too short", () => {
  for (const k of [undefined, null, "", "short-key"]) assert.equal(planOwnerKey(k, "").action, "fail");
  assert.equal(planOwnerKey(undefined, "").reason, "missing");
  assert.equal(planOwnerKey("x".repeat(23), "").reason, "too-short");
  assert.notEqual(planOwnerKey("x".repeat(24), "").action, "fail");
});

test("repeated deployments with the same key never update the secret; a changed key updates it exactly once", () => {
  let deployed = ""; // first deploy: nothing on the Worker yet
  const updates = [];
  const deploy = (key) => { const p = planOwnerKey(key, deployed); if (p.action === "rotate") { updates.push(p.keyId); deployed = p.keyId; } return p.action; };
  assert.equal(deploy(KEY), "rotate");
  for (let i = 0; i < 5; i++) assert.equal(deploy(KEY), "skip");
  assert.equal(updates.length, 1);
  assert.equal(deploy(KEY + "-rotated"), "rotate");
  for (let i = 0; i < 3; i++) assert.equal(deploy(KEY + "-rotated"), "skip");
  assert.equal(updates.length, 2);
});

test("a failed secret update is retried on the next run (marker is only written after the secret)", () => {
  // Run 1 deployed with marker "unset" and the secret put failed -> marker still not the key id -> next run rotates again.
  assert.equal(planOwnerKey(KEY, "unset").action, "rotate");
});

test("marker is a short one-way id: it never contains the key and differs per key", () => {
  const id = keyId(KEY);
  assert.match(id, /^[a-f0-9]{16}$/);
  assert.ok(!KEY.includes(id) && !id.includes(KEY));
  assert.notEqual(id, keyId(KEY + "x"));
});

test("reading the deployed marker: 404 means not deployed, API errors fail closed", async () => {
  const mk = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });
  const args = { accountId: "a", workerName: "w", token: "t" };
  assert.equal(await readDeployedMarker({ ...args, fetchImpl: mk(404, {}) }), "");
  assert.equal(await readDeployedMarker({ ...args, fetchImpl: mk(200, { success: true, result: { bindings: [{ type: "plain_text", name: MARKER_BINDING, text: "abc" }, { type: "secret_text", name: "TOURS_OWNER_KEY" }] } }) }), "abc");
  assert.equal(await readDeployedMarker({ ...args, fetchImpl: mk(200, { success: true, result: { bindings: [] } }) }), "");
  await assert.rejects(readDeployedMarker({ ...args, fetchImpl: mk(500, { success: false }) }));
  await assert.rejects(readDeployedMarker({ ...args, fetchImpl: mk(403, null) }));
});

test("CLI exits non-zero without contacting Cloudflare when the secret is missing, and never prints a key", () => {
  const run = (env) => spawnSync(process.execPath, [SCRIPT], { env: { PATH: process.env.PATH, ...env }, encoding: "utf8" });
  const missing = run({});
  assert.equal(missing.status, 1);
  assert.match(missing.stdout + missing.stderr, /TOURS_PREVIEW_OWNER_KEY is missing/);
  assert.match(missing.stdout + missing.stderr, /settings\/secrets\/actions/);
  const short = run({ SETTINGS_OWNER_KEY: "tiny" });
  assert.equal(short.status, 1);
  assert.ok(!(short.stdout + short.stderr).includes("tiny\n"));
});

test("repeated deployments: the same persistent key authenticates every settings read, across Durable Object restarts", async () => {
  const storage = fakeStorage(); // survives "deployments"
  const env = { TOURS_OWNER_KEY: KEY, TOURS_ENVIRONMENT: "staging" };
  let version;
  for (let deployment = 1; deployment <= 4; deployment++) {
    const stub = new TourSettingsDO({ storage }, env); // new Worker/DO instance = a redeploy
    for (let read = 0; read < 3; read++) {
      const res = await stub.fetch(new Request("https://x.test/settings", { headers: { authorization: `Bearer ${KEY}`, "x-client-id": `d${deployment}` } }));
      assert.equal(res.status, 200, `deployment ${deployment} read ${read}`);
      const body = await res.json();
      version ??= body.version;
      assert.equal(body.version, version); // redeploying never changes settings
    }
  }
});

test("strict authentication and lockout are unchanged", async () => {
  const stub = new TourSettingsDO({ storage: fakeStorage() }, { TOURS_OWNER_KEY: KEY, TOURS_ENVIRONMENT: "staging" });
  const get = async (auth) => (await stub.fetch(new Request("https://x.test/settings", { headers: { ...(auth ? { authorization: auth } : {}), "x-client-id": "attacker" } }))).status;
  assert.equal(await get(null), 401);
  for (let i = 0; i < 4; i++) assert.equal(await get("Bearer wrong-key-0123456789abcdefgh"), 401);
  assert.equal(await get("Bearer wrong-key-0123456789abcdefgh"), 429);
  assert.equal(await get(`Bearer ${KEY}`), 429); // locked out even with the right key
  const noKey = new TourSettingsDO({ storage: fakeStorage() }, { TOURS_ENVIRONMENT: "staging" });
  assert.equal((await noKey.fetch(new Request("https://x.test/settings", { headers: { authorization: `Bearer ${KEY}` } }))).status, 503); // fail closed
});

test("the public health endpoint exposes no key material or fingerprint", async () => {
  const env = { TOURS_ENVIRONMENT: "staging", TOURS_OWNER_KEY: KEY, TOURS_OWNER_KEY_ID: keyId(KEY), TOUR_SETTINGS: {} };
  const text = await (await worker.fetch(new Request("https://w.test/health"), env)).text();
  assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ["environment", "ok", "service"]);
  assert.ok(!text.includes(KEY) && !text.includes(keyId(KEY)));
});

test("workflow: persistent key, no random fallback, conditional secret update, 5xx retry kept", () => {
  const wf = readFileSync(new URL("../../../.github/workflows/deploy-tours-preview.yml", import.meta.url), "utf8");
  const job = wf.slice(wf.indexOf("  tours-settings:"), wf.indexOf("  stripe-sandbox:"));
  assert.ok(!/openssl rand/.test(job), "tours-settings job must not generate a random key");
  assert.match(job, /tours-owner-key\.mjs/);
  assert.match(job, /\[ "\$ACTION" = "rotate" \]/);
  assert.equal((job.match(/secret put TOURS_OWNER_KEY/g) || []).length, 1);
  assert.ok(job.indexOf("secret put TOURS_OWNER_KEY") > job.indexOf('"$ACTION" = "rotate"'));
  assert.match(job, /smoke_call 401 "Unauthenticated read"/);
  assert.match(job, /smoke_call 401 "Wrong owner key"/);
  assert.match(job, /smoke_call 200 "Read settings"/);
  const smoke = readFileSync(new URL("../../../scripts/tours-smoke-http.sh", import.meta.url), "utf8");
  assert.match(smoke, /5\[0-9\]\[0-9\]|5xx|\^5/);
});
