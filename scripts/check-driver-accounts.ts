/**
 * Stage 1 driver accounts — checks against a real SQLite database (node:sqlite) that
 * mimics the D1 API. Run: npx tsx scripts/check-driver-accounts.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  AI_RECEPTIONIST_DIGITS,
  DRIVER_ACCOUNT_SESSION_HEADER,
  handleDriverAccountsRequest,
  normaliseUkPhone,
  type D1Like,
  type D1PreparedLike,
} from "../workers/addresses/src/driver-accounts";

function d1(db: DatabaseSync): D1Like {
  const make = (sql: string, values: unknown[] = []): D1PreparedLike & { _run(): unknown } => ({
    bind: (...v: unknown[]) => make(sql, v),
    first: async <T>() => (db.prepare(sql).get(...(values as never[])) as T) ?? null,
    all: async <T>() => ({ results: db.prepare(sql).all(...(values as never[])) as T[] }),
    run: async () => db.prepare(sql).run(...(values as never[])),
    _run: () => db.prepare(sql).run(...(values as never[])),
  });
  return {
    prepare: (sql: string) => make(sql),
    batch: async (statements) => {
      db.exec("BEGIN");
      try {
        const out = statements.map((s) => (s as ReturnType<typeof make>)._run());
        db.exec("COMMIT");
        return out;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync("workers/addresses/migrations/driver-db/0001_stage1_driver_accounts.sql", "utf8"));
const env = { DRIVER_DB: d1(sqlite) };

let clock = new Date("2026-11-10T12:00:00Z");
let tokenN = 0;
const deps = {
  ownerAuthorized: (r: Request) => r.headers.get("X-Owner-Key") === "staging-owner",
  corsHeaders: () => ({ "Access-Control-Allow-Origin": "https://matni-dashboard-staging.pages.dev", "Access-Control-Allow-Headers": "Content-Type" }),
  now: () => clock,
  randomToken: (prefix: string) => `${prefix}test${++tokenN}`,
};

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await handleDriverAccountsRequest(
    new Request(`https://w.test${path}`, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    deps,
  );
  assert.ok(res, `no response for ${path}`);
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any>, headers: res.headers };
}
const owner = { "X-Owner-Key": "staging-owner" };
const asDriver = (token: string) => ({ [DRIVER_ACCOUNT_SESSION_HEADER]: token });

async function main() {
  // Not our route → null; no DB → 404.
  assert.equal(await handleDriverAccountsRequest(new Request("https://w.test/bookings"), env, deps), null);
  const noDb = await handleDriverAccountsRequest(new Request("https://w.test/owner/driver-accounts"), {}, deps);
  assert.equal(noDb?.status, 404);

  // Owner auth.
  assert.equal((await call("GET", "/owner/driver-accounts")).status, 401);
  assert.equal((await call("GET", "/owner/driver-accounts", undefined, { "X-Owner-Key": "live-key" })).status, 401);

  // CORS preflight allows the session header.
  const pre = await call("OPTIONS", "/driver-portal/account/me");
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get("Access-Control-Allow-Headers") || "", /X-Driver-Account-Session/);

  // Invite.
  assert.equal((await call("POST", "/owner/driver-accounts/invite", { name: "", email: "x@y.z" }, owner)).status, 400);
  const inv = await call("POST", "/owner/driver-accounts/invite", { name: "Test Driver", email: "Test@Example.com", mobile: "+44 7700 900123" }, owner);
  assert.equal(inv.status, 201);
  const driverId = inv.body.driverId as string;
  assert.ok(inv.body.inviteToken.startsWith("dinv_"));
  assert.equal((await call("POST", "/owner/driver-accounts/invite", { name: "Dup", email: "test@example.com" }, owner)).status, 409);
  // Only a hash is stored.
  const stored = sqlite.prepare("SELECT token_hash FROM driver_links").all() as { token_hash: string }[];
  assert.ok(stored.every((r) => !r.token_hash.includes("dinv_")));

  // Accept invite: a form error does not burn the link.
  const bad = await call("POST", "/driver-portal/account/accept-invite", { token: inv.body.inviteToken, operatorName: "TD Cars" });
  assert.equal(bad.status, 400);
  const acc = await call("POST", "/driver-portal/account/accept-invite", {
    token: inv.body.inviteToken,
    operatorName: "TD Cars",
    operatorLicenceNumber: "OP-123",
    confirmOwnOperatorLicence: true,
    vehicleSummary: "Skoda Superb",
  });
  assert.equal(acc.status, 200, JSON.stringify(acc.body));
  const session = acc.body.sessionToken as string;
  // Single use.
  assert.equal((await call("POST", "/driver-portal/account/accept-invite", { token: inv.body.inviteToken, operatorName: "a", operatorLicenceNumber: "b", confirmOwnOperatorLicence: true })).status, 410);

  // Applied driver: can see profile, cannot set availability or message the office; no support number.
  let me = await call("GET", "/driver-portal/account/me", undefined, asDriver(session));
  assert.equal(me.status, 200);
  assert.equal(me.body.driver.status, "applied");
  assert.deepEqual(me.body.contactOffice, { mode: "message" });
  assert.equal(me.body.driver.mobile, "07700900123");
  assert.equal((await call("POST", "/driver-portal/account/availability", { available: true }, asDriver(session))).status, 403);
  assert.equal((await call("GET", "/driver-portal/account/me")).status, 401);

  // Approval blocked until documents are accepted.
  const early = await call("POST", "/owner/driver-accounts/status", { driverId, action: "approve" }, owner);
  assert.equal(early.status, 409);
  assert.equal(early.body.missing.length, 4);

  // Documents.
  assert.equal((await call("POST", "/driver-portal/account/documents", { kind: "insurance", expiresOn: "2026-01-01" }, asDriver(session))).status, 400);
  const docIds: string[] = [];
  for (const kind of ["operator_licence", "phv_driver_licence", "vehicle_licence", "insurance"]) {
    const r = await call("POST", "/driver-portal/account/documents", { kind, expiresOn: kind === "insurance" ? "2026-11-30" : "2027-06-30", reference: "REF" }, asDriver(session));
    assert.equal(r.status, 201);
    docIds.push(r.body.documentId);
  }
  assert.equal((await call("POST", "/owner/driver-accounts/document-review", { documentId: docIds[0], decision: "reject" }, owner)).status, 400);
  for (const id of docIds) {
    assert.equal((await call("POST", "/owner/driver-accounts/document-review", { documentId: id, decision: "accept" }, owner)).status, 200);
  }
  assert.equal((await call("POST", "/owner/driver-accounts/document-review", { documentId: docIds[0], decision: "accept" }, owner)).status, 409);

  // Approve.
  const ok = await call("POST", "/owner/driver-accounts/status", { driverId, action: "approve" }, owner);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));

  // List flags the insurance expiring within 30 days.
  const list = await call("GET", "/owner/driver-accounts", undefined, owner);
  assert.equal(list.body.drivers.length, 1);
  assert.ok(list.body.drivers[0].attention.some((n: string) => /insurance expires 2026-11-30/i.test(n)));

  // Support contact: rejects the AI receptionist number; message fallback until set.
  assert.equal(normaliseUkPhone("028 9602 2952"), AI_RECEPTIONIST_DIGITS);
  assert.equal((await call("POST", "/owner/driver-accounts/support-contact", { phone: "028 9602 2952" }, owner)).status, 400);
  me = await call("GET", "/driver-portal/account/me", undefined, asDriver(session));
  assert.deepEqual(me.body.contactOffice, { mode: "message" });
  assert.equal((await call("POST", "/owner/driver-accounts/support-contact", { phone: "07700 900456" }, owner)).status, 200);
  me = await call("GET", "/driver-portal/account/me", undefined, asDriver(session));
  assert.deepEqual(me.body.contactOffice, { mode: "phone", phone: "07700900456" });
  // Driver cannot read owner settings with a driver session.
  assert.equal((await call("GET", "/owner/driver-accounts/support-contact", undefined, asDriver(session))).status, 401);

  // Availability + office message.
  assert.equal((await call("POST", "/driver-portal/account/availability", { available: true }, asDriver(session))).status, 200);
  assert.equal((await call("POST", "/driver-portal/account/contact-office", { message: "Running 10 min late to the depot" }, asDriver(session))).status, 201);
  const detail = await call("GET", `/owner/driver-accounts/detail?id=${driverId}`, undefined, owner);
  assert.equal(detail.body.messages.length, 1);
  assert.equal(detail.body.driver.available, true);

  // Suspend: reason required; sessions revoked; availability cleared.
  assert.equal((await call("POST", "/owner/driver-accounts/status", { driverId, action: "suspend" }, owner)).status, 400);
  assert.equal((await call("POST", "/owner/driver-accounts/status", { driverId, action: "suspend", reason: "Insurance query" }, owner)).status, 200);
  assert.equal((await call("GET", "/driver-portal/account/me", undefined, asDriver(session))).status, 401);
  assert.equal((await call("POST", "/owner/driver-accounts/sign-in-link", { driverId }, owner)).status, 409);

  // Reinstate, then a fresh single-use sign-in link.
  assert.equal((await call("POST", "/owner/driver-accounts/status", { driverId, action: "reinstate" }, owner)).status, 200);
  const link1 = await call("POST", "/owner/driver-accounts/sign-in-link", { driverId }, owner);
  const link2 = await call("POST", "/owner/driver-accounts/sign-in-link", { driverId }, owner);
  assert.equal((await call("POST", "/driver-portal/account/sign-in", { token: link1.body.signInToken })).status, 410, "older link replaced");
  const signIn = await call("POST", "/driver-portal/account/sign-in", { token: link2.body.signInToken });
  assert.equal(signIn.status, 200);
  assert.equal((await call("POST", "/driver-portal/account/sign-in", { token: link2.body.signInToken })).status, 410);
  me = await call("GET", "/driver-portal/account/me", undefined, asDriver(signIn.body.sessionToken));
  assert.equal(me.body.driver.available, false, "suspension cleared availability");

  // Link expiry.
  const link3 = await call("POST", "/owner/driver-accounts/sign-in-link", { driverId }, owner);
  clock = new Date(clock.getTime() + 31 * 60 * 1000);
  assert.equal((await call("POST", "/driver-portal/account/sign-in", { token: link3.body.signInToken })).status, 410);

  // Sign out.
  assert.equal((await call("POST", "/driver-portal/account/sign-out", {}, asDriver(signIn.body.sessionToken))).status, 200);
  assert.equal((await call("GET", "/driver-portal/account/me", undefined, asDriver(signIn.body.sessionToken))).status, 401);

  // Remove.
  assert.equal((await call("POST", "/owner/driver-accounts/status", { driverId, action: "remove", reason: "Left" }, owner)).status, 200);
  assert.equal((await call("GET", "/owner/driver-accounts", undefined, owner)).body.drivers.length, 0);

  // Audit log is append-only and complete; never contains the support number.
  const audit = sqlite.prepare("SELECT action, detail FROM audit_log ORDER BY seq").all() as { action: string; detail: string }[];
  const actions = audit.map((a) => a.action);
  for (const expected of ["driver.invited", "driver.applied", "document.submitted", "document.accepted", "driver.approved", "settings.driver_support_set", "driver.available", "driver.office_message", "driver.suspended", "driver.approved", "driver.signed_in", "driver.signed_out", "driver.removed"]) {
    assert.ok(actions.includes(expected), `audit missing ${expected}`);
  }
  assert.ok(!JSON.stringify(audit).includes("07700900456"));
  assert.throws(() => sqlite.exec("DELETE FROM audit_log"), /append-only/);
  assert.throws(() => sqlite.exec("UPDATE audit_log SET action = 'x'"), /append-only/);

  console.log(`check-driver-accounts: all checks passed (${audit.length} audit entries)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
