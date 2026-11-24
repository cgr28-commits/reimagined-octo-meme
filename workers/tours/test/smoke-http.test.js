import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../../../scripts/tours-smoke-http.sh", import.meta.url));
const SECRET = "super-secret-owner-key-0123456789";

/** Starts a local server that answers with the scripted codes in order (the last one repeats). */
async function server(script) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    const step = script[Math.min(seen.length, script.length - 1)];
    seen.push({ auth: req.headers.authorization });
    res.writeHead(step.code, { "content-type": "application/json" });
    res.end(step.body ?? "{}");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { srv, seen, url: `http://127.0.0.1:${srv.address().port}/x` };
}
const run = (url, expected, extra = {}) =>
  new Promise((resolve) => {
    execFile("bash", ["-c", `. "${SCRIPT}"; smoke_call ${expected} "Test call" -H "Authorization: Bearer ${SECRET}" "${url}"; rc=$?; echo "RESULT code=$SMOKE_CODE retries=$SMOKE_RETRIES rc=$rc"; exit $rc`], { env: { ...process.env, SMOKE_DELAY: "0", SMOKE_SECRET: SECRET, ...extra } }, (error, stdout, stderr) => resolve({ rc: error ? error.code : 0, out: stdout + stderr }));
  });

test("transient 5xx responses are retried and the call then succeeds", async () => {
  const s = await server([{ code: 500, body: '{"error":"internal-error"}' }, { code: 502 }, { code: 200 }]);
  const r = await run(s.url, 200);
  s.srv.close();
  assert.equal(r.rc, 0);
  assert.match(r.out, /RESULT code=200 retries=2 rc=0/);
  assert.equal(s.seen.length, 3);
  assert.equal((r.out.match(/::warning::Test call: transient HTTP 5\d\d/g) || []).length, 2); // every retry is logged
});
test("a persistent 5xx is NOT hidden: bounded attempts, then failure", async () => {
  const s = await server([{ code: 500, body: '{"error":"internal-error","detail":"Error: boom"}' }]);
  const r = await run(s.url, 200);
  s.srv.close();
  assert.notEqual(r.rc, 0);
  assert.equal(s.seen.length, 6); // exactly the bound
  assert.match(r.out, /::error::Test call: expected HTTP 200, got 500/);
  assert.match(r.out, /retries=6/);
});
test("the retry bound is configurable", async () => {
  const s = await server([{ code: 503 }]);
  const r = await run(s.url, 200, { SMOKE_MAX_ATTEMPTS: "2" });
  s.srv.close();
  assert.notEqual(r.rc, 0);
  assert.equal(s.seen.length, 2);
});
test("expected non-5xx codes (e.g. 401, 409) pass and are never retried", async () => {
  for (const code of [401, 409]) {
    const s = await server([{ code }]);
    const r = await run(s.url, code);
    s.srv.close();
    assert.equal(r.rc, 0);
    assert.equal(s.seen.length, 1);
    assert.match(r.out, /retries=0/);
  }
});
test("an unexpected 4xx fails immediately without retrying", async () => {
  const s = await server([{ code: 404, body: '{"error":"not-found"}' }]);
  const r = await run(s.url, 200);
  s.srv.close();
  assert.notEqual(r.rc, 0);
  assert.equal(s.seen.length, 1);
  assert.match(r.out, /expected HTTP 200, got 404/);
});
test("an expected 200 that comes back as 401 is a failure, not a retry", async () => {
  const s = await server([{ code: 401 }]);
  const r = await run(s.url, 200);
  s.srv.close();
  assert.notEqual(r.rc, 0);
  assert.equal(s.seen.length, 1);
});
test("no response at all (connection refused) is retried a bounded number of times, then fails", async () => {
  const s = await server([{ code: 200 }]);
  const url = s.url;
  await new Promise((r) => s.srv.close(r));
  const r = await run(url, 200, { SMOKE_MAX_ATTEMPTS: "3" });
  assert.notEqual(r.rc, 0);
  assert.match(r.out, /transient HTTP 000 on attempt 3\/3/);
  assert.match(r.out, /got 000/);
});
test("diagnostics are sanitised: secret and bearer tokens redacted, body truncated, control characters removed", async () => {
  const body = JSON.stringify({ error: "x", leak: `Bearer abc.def-123 ${SECRET}`, pad: "y".repeat(500) }) + "\u0007\u001b[31m";
  const s = await server([{ code: 500, body }]);
  const r = await run(s.url, 200, { SMOKE_MAX_ATTEMPTS: "1" });
  s.srv.close();
  assert.ok(!r.out.includes(SECRET), "secret leaked");
  assert.ok(!r.out.includes("abc.def-123"), "bearer token leaked");
  assert.match(r.out, /\[redacted\]/);
  assert.ok(!/[\u0007\u001b]/.test(r.out), "control characters not removed");
  const line = r.out.split("\n").find((l) => l.startsWith("::error::"));
  assert.ok(line.length < 400, "body not truncated");
  assert.ok(!r.out.includes("Authorization"), "request header printed");
});
test("the workflow uses the helper for every deployed-Worker call and the old inline retry is gone", async () => {
  const { readFileSync } = await import("node:fs");
  const wf = readFileSync(new URL("../../../.github/workflows/deploy-tours-preview.yml", import.meta.url), "utf8");
  const job = wf.slice(wf.indexOf("  tours-settings:"), wf.indexOf("  stripe-sandbox:"));
  assert.match(job, /\. \.\.\/\.\.\/scripts\/tours-smoke-http\.sh/);
  assert.ok(!/\$\(curl -sS /.test(job), "an unretried curl -sS remains in the tours-settings job");
  assert.ok(!/status\(\)/.test(job));
  assert.match(job, /SMOKE_SECRET="\$SETTINGS_OWNER_KEY"/);
});
