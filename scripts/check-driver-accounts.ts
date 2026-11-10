/**
 * Stage 1 driver accounts — checks against a real SQLite database (node:sqlite) that
 * mimics the D1 API. Run: npx tsx scripts/check-driver-accounts.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { checkBookingAssignment, upcomingBookingsForDriver } from "../workers/addresses/src/driver-upcoming-bookings";
import {
  AI_RECEPTIONIST_DIGITS,
  type BookingAssignmentCheck,
  type DriverUpcomingBooking,
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
for (const file of ["0001_stage1_driver_accounts.sql", "0002_stage1_alerts_priority.sql", "0003_stage1_booking_review_items.sql"]) {
  sqlite.exec(readFileSync(`workers/addresses/migrations/driver-db/${file}`, "utf8"));
}
const env = { DRIVER_DB: d1(sqlite) };

let clock = new Date("2026-11-10T12:00:00Z");
let tokenN = 0;
let bookingLookup: (d: { email: string }) => Promise<DriverUpcomingBooking[]> = async () => [];
let lookupCalls = 0;
/** Current booking state the stub reports (reference → check). Never written by the code under test. */
const bookingState = new Map<string, BookingAssignmentCheck>();
const deps = {
  checkBookingAssignment: async (reference: string) =>
    bookingState.get(reference) ?? { found: false, cancelled: false, assignedToThisDriver: false, otherDriver: "" },
  findUpcomingBookingsForDriver: (d: { id: string; name: string; email: string; mobile: string }) => {
    lookupCalls++;
    return bookingLookup(d);
  },
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

  await refinements();
  console.log(`check-driver-accounts: all checks passed (${audit.length}+ audit entries)`);
}

/** Stage 1 refinements (owner feedback 10 Nov 2026). */
async function refinements() {
  clock = new Date("2026-11-10T20:00:00Z");
  // Helper: create an approved driver.
  async function approvedDriver(name: string, email: string, mobile: string) {
    const inv = await call("POST", "/owner/driver-accounts/invite", { name, email, mobile }, owner);
    const acc = await call("POST", "/driver-portal/account/accept-invite", {
      token: inv.body.inviteToken, operatorName: `${name} Cars`, operatorLicenceNumber: "OL-1", confirmOwnOperatorLicence: true,
    });
    const session = acc.body.sessionToken as string;
    for (const kind of ["operator_licence", "phv_driver_licence", "vehicle_licence", "insurance"]) {
      const r = await call("POST", "/driver-portal/account/documents", { kind, expiresOn: "2027-12-31" }, asDriver(session));
      await call("POST", "/owner/driver-accounts/document-review", { documentId: r.body.documentId, decision: "accept" }, owner);
    }
    assert.equal((await call("POST", "/owner/driver-accounts/status", { driverId: inv.body.driverId, action: "approve" }, owner)).status, 200);
    return { id: inv.body.driverId as string, session };
  }
  const a = await approvedDriver("Aine Able", "aine@example.com", "07700 900201");
  const b = await approvedDriver("Brendan Bell", "brendan@example.com", "07700 900202");

  // 1. Support number: server rejects invalid numbers and the receptionist line in any format.
  for (const bad of ["12345", "not a number", "028 9602 295", "+44 28 9602 2952", "0044 28 96022952", "02896022952"]) {
    assert.equal((await call("POST", "/owner/driver-accounts/support-contact", { phone: bad }, owner)).status, 400, bad);
  }
  assert.equal((await call("POST", "/owner/driver-accounts/support-contact", { phone: "+44 7700 900999" }, owner)).body.phone, "07700900999");

  // 2. Support number only reaches approved, signed-in drivers.
  assert.equal((await call("GET", "/driver-portal/account/me")).status, 401, "anonymous");
  assert.equal((await call("GET", "/driver-portal/account/me", undefined, asDriver("dacc_forged"))).status, 401, "forged session");
  assert.equal((await call("GET", "/owner/driver-accounts/support-contact", undefined, asDriver(a.session))).status, 401, "driver cannot read owner setting");
  const inv3 = await call("POST", "/owner/driver-accounts/invite", { name: "Cara Applied", email: "cara@example.com" }, owner);
  const cara = await call("POST", "/driver-portal/account/accept-invite", { token: inv3.body.inviteToken, mobile: "07700900203", operatorName: "C", operatorLicenceNumber: "X", confirmOwnOperatorLicence: true });
  const caraMe = await call("GET", "/driver-portal/account/me", undefined, asDriver(cara.body.sessionToken));
  assert.deepEqual(caraMe.body.contactOffice, { mode: "message" }, "applied driver gets no number");
  assert.ok(!JSON.stringify(caraMe.body).includes("07700900999"));
  assert.deepEqual((await call("GET", "/driver-portal/account/me", undefined, asDriver(a.session))).body.contactOffice, { mode: "phone", phone: "07700900999" });

  // 3. Unread + urgent messages, urgent first.
  assert.equal((await call("POST", "/driver-portal/account/contact-office", { message: "Free Friday", category: "general" }, asDriver(a.session))).body.priority, "normal");
  assert.equal((await call("POST", "/driver-portal/account/contact-office", { message: "x", category: "bogus" }, asDriver(b.session))).status, 400);
  const urgent = await call("POST", "/driver-portal/account/contact-office", { message: "Flat tyre on the M1, passenger on board", category: "breakdown" }, asDriver(b.session));
  assert.equal(urgent.body.priority, "urgent");
  let list = await call("GET", "/owner/driver-accounts", undefined, owner);
  assert.equal(list.body.drivers[0].name, "Brendan Bell", "urgent report sorts first");
  assert.equal(list.body.drivers[0].urgentMessages, 1);
  assert.equal(list.body.drivers[1].unreadMessages, 1);
  let summary = await call("GET", "/owner/driver-accounts/summary", undefined, owner);
  assert.equal(summary.body.unreadMessages, 2);
  assert.equal(summary.body.urgent.length, 1);
  assert.equal(summary.body.urgent[0].categoryLabel, "Vehicle breakdown");
  // Opening (mark read) does not clear an urgent report; marking handled does, and is audited.
  await call("POST", "/owner/driver-accounts/messages/read", { driverId: b.id }, owner);
  summary = await call("GET", "/owner/driver-accounts/summary", undefined, owner);
  assert.equal(summary.body.urgent.length, 1, "urgent stays until handled");
  const detailB = await call("GET", `/owner/driver-accounts/detail?id=${b.id}`, undefined, owner);
  assert.equal(detailB.body.messages[0].urgent, true);
  assert.equal((await call("POST", "/owner/driver-accounts/messages/handled", { messageId: urgent.body.messageId }, owner)).status, 200);
  summary = await call("GET", "/owner/driver-accounts/summary", undefined, owner);
  assert.equal(summary.body.urgent.length, 0);
  // Urgent reports are never rate-limited.
  for (let i = 0; i < 21; i++) await call("POST", "/driver-portal/account/contact-office", { message: `m${i}`, category: "general" }, asDriver(a.session));
  assert.equal((await call("POST", "/driver-portal/account/contact-office", { message: "late", category: "general" }, asDriver(a.session))).status, 429);
  assert.equal((await call("POST", "/driver-portal/account/contact-office", { message: "Accident at airport roundabout", category: "accident" }, asDriver(a.session))).status, 201);

  // 5. Offers gate.
  await call("POST", "/driver-portal/account/availability", { available: true }, asDriver(a.session));
  let detailA = await call("GET", `/owner/driver-accounts/detail?id=${a.id}`, undefined, owner);
  assert.equal(detailA.body.canReceiveOffers, true);

  // 4 + 5 + 6 + 7. Suspension: reason required, audited with who/when, sessions revoked,
  // offers blocked, upcoming bookings raised for manual review, bookings untouched.
  const bookings: DriverUpcomingBooking[] = [
    { reference: "MATNI-1201", tripDate: "2026-11-14", tripTime: "05:30", pickup: "Glengormley", customerName: "Niamh", leg: "outbound", matchMethod: "driver_id", assignment: { driverAccountId: a.id, assignmentStatus: "accepted" } },
    { reference: "MATNI-1207", tripDate: "2026-11-20", tripTime: "14:10", pickup: "Return journey", customerName: "Paul", leg: "return", matchMethod: "driver_id", assignment: { driverAccountId: a.id, assignmentStatus: "accepted" } },
    { reference: "MATNI-1215", tripDate: "2026-11-22", tripTime: "08:00", pickup: "Antrim", customerName: "Orla", leg: "outbound", matchMethod: "contact", assignment: { driverEmail: "aine@example.com", assignmentStatus: "pending" } },
  ];
  for (const b of bookings) bookingState.set(b.reference, { found: true, cancelled: false, assignedToThisDriver: true, otherDriver: "" });
  const snapshot = JSON.stringify(bookings);
  bookingLookup = async (d) => (d.email === "aine@example.com" ? bookings : []);
  assert.equal((await call("POST", "/owner/driver-accounts/status", { driverId: a.id, action: "suspend", reason: "" }, owner)).status, 400);
  const before = lookupCalls;
  const sus = await call("POST", "/owner/driver-accounts/status", { driverId: a.id, action: "suspend", reason: "Insurance query" }, owner);
  assert.equal(sus.status, 200);
  assert.equal(lookupCalls, before + 1);
  assert.equal(sus.body.reviewBookings.length, 3);
  assert.equal(JSON.stringify(bookings), snapshot, "bookings are only read");
  assert.equal((await call("GET", "/driver-portal/account/me", undefined, asDriver(a.session))).status, 401, "session revoked");
  detailA = await call("GET", `/owner/driver-accounts/detail?id=${a.id}`, undefined, owner);
  assert.equal(detailA.body.canReceiveOffers, false, "offers blocked");
  assert.equal(detailA.body.driver.available, false);
  const susAudit = detailA.body.audit.find((x: any) => x.action === "driver.suspended");
  assert.equal(susAudit.actor_type, "owner");
  assert.equal(susAudit.detail.reason, "Insurance query");
  assert.equal(susAudit.detail.by, "Owner (owner sign-in)");
  assert.equal(susAudit.at, clock.toISOString());
  assert.equal(susAudit.detail.sessionsRevoked, true);
  summary = await call("GET", "/owner/driver-accounts/summary", undefined, owner);
  const alert = summary.body.alerts.find((x: any) => x.driverId === a.id);
  assert.ok(alert, "alert raised");
  assert.match(alert.title, /Aine Able was suspended with 3 upcoming bookings/);
  assert.deepEqual(alert.items.map((x: any) => `${x.reference}:${x.status}:${x.matchMethod}`), [
    "MATNI-1201:needs_replacement:driver_id",
    "MATNI-1207:needs_replacement:driver_id",
    "MATNI-1215:needs_replacement:contact",
  ]);
  assert.equal(alert.unresolved, 3);
  assert.equal(alert.items[0].originalDriverId, a.id);
  assert.equal(alert.items[0].suspensionReason, "Insurance query");
  const [i1, i2, i3] = alert.items.map((x: any) => x.id as string);
  const item = (status: string, itemId: string, note = "") => call("POST", "/owner/driver-accounts/alerts/item", { itemId, status, note }, owner);

  // No general "mark reviewed": an alert that lists bookings can't be closed as a whole.
  assert.equal((await call("POST", "/owner/driver-accounts/alerts/resolve", { alertId: alert.id, note: "All sorted" }, owner)).status, 409);
  // Reinstating the driver changes no booking and does not clear the alert.
  await call("POST", "/owner/driver-accounts/status", { driverId: a.id, action: "reinstate" }, owner);
  assert.equal((await call("GET", "/owner/driver-accounts/summary", undefined, owner)).body.alerts.length, 1);

  // Replacement confirmed only once the booking really has another driver.
  let r = await item("replacement_confirmed", i1);
  assert.equal(r.status, 409); assert.match(r.body.error, /still assigned to Aine Able/);
  bookingState.set("MATNI-1201", { found: true, cancelled: false, assignedToThisDriver: false, otherDriver: "Brendan" });
  r = await item("replacement_confirmed", i1);
  assert.equal(r.status, 200); assert.equal(r.body.alertResolved, false);
  // Cancelled only once the booking really is cancelled (nothing is cancelled automatically).
  r = await item("cancelled", i2);
  assert.equal(r.status, 409); assert.match(r.body.error, /isn't cancelled/);
  bookingState.set("MATNI-1207", { found: true, cancelled: true, assignedToThisDriver: false, otherDriver: "" });
  assert.equal((await item("cancelled", i2)).status, 200);
  // Acknowledge needs a recorded reason.
  assert.equal((await item("acknowledged", i3)).status, 400);
  assert.equal((await item("bogus", i3)).status, 400);
  let still = (await call("GET", "/owner/driver-accounts/summary", undefined, owner)).body.alerts.find((x: any) => x.id === alert.id);
  assert.equal(still.unresolved, 1, "alert stays while one booking is unresolved");
  // Reopen needs a reason too; then acknowledge closes the alert automatically.
  assert.equal((await item("needs_replacement", i1)).status, 400);
  r = await item("acknowledged", i3, "Customer rebooked directly with another operator");
  assert.equal(r.status, 200); assert.equal(r.body.alertResolved, true);
  assert.equal((await call("GET", "/owner/driver-accounts/summary", undefined, owner)).body.alerts.length, 0);

  // Originals are permanent: snapshot can't be edited or deleted; full history kept.
  assert.throws(() => sqlite.exec(`UPDATE owner_alert_items SET original_driver_id = 'x' WHERE id = '${i1}'`), /permanent/);
  assert.throws(() => sqlite.exec(`UPDATE owner_alert_items SET suspension_reason = '' WHERE id = '${i1}'`), /permanent/);
  assert.throws(() => sqlite.exec("DELETE FROM owner_alert_items"), /permanent/);
  assert.throws(() => sqlite.exec("DELETE FROM owner_alerts"), /permanent/);
  const kept = sqlite.prepare("SELECT original_assignment, original_driver_name, status, status_note FROM owner_alert_items WHERE id = ?").get(i3) as any;
  assert.equal(JSON.parse(kept.original_assignment).driverEmail, "aine@example.com");
  assert.equal(kept.original_driver_name, "Aine Able");
  assert.equal(kept.status_note, "Customer rebooked directly with another operator");
  const hist = (sqlite.prepare("SELECT action, detail FROM audit_log WHERE action IN ('booking_review.updated','alert.raised','alert.all_bookings_resolved','driver.suspended') AND driver_id = ? ORDER BY seq").all(a.id) as any[]);
  assert.deepEqual(hist.map((h) => h.action), ["driver.suspended", "alert.raised", "booking_review.updated", "booking_review.updated", "booking_review.updated", "alert.all_bookings_resolved"]);
  assert.equal(JSON.parse(hist[2].detail).otherDriver, "Brendan");
  assert.equal(JSON.stringify(bookings.map(({ reference, leg }) => ({ reference, leg }))), JSON.stringify(JSON.parse(snapshot).map(({ reference, leg }: any) => ({ reference, leg }))), "bookings are only read");

  // Lookup failure still raises an alert (never silently skipped).
  bookingLookup = async () => { throw new Error("KV down"); };
  await call("POST", "/owner/driver-accounts/status", { driverId: b.id, action: "suspend", reason: "Test" }, owner);
  const failAlert = (await call("GET", "/owner/driver-accounts/summary", undefined, owner)).body.alerts[0];
  assert.match(failAlert.title, /check their upcoming bookings by hand/);
  assert.equal((await call("POST", "/owner/driver-accounts/alerts/resolve", { alertId: failAlert.id }, owner)).status, 400, "reason required");
  assert.equal((await call("POST", "/owner/driver-accounts/alerts/resolve", { alertId: failAlert.id, note: "Checked the calendar: no jobs" }, owner)).status, 200);
  // No booking-changing calls exist in the module.
  const src = readFileSync("workers/addresses/src/driver-accounts.ts", "utf8") + readFileSync("workers/addresses/src/driver-upcoming-bookings.ts", "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/\.put\(|\.delete\(|TRACKING_STORE|BOOKING_COUNTER|stripe|refund|cancelBooking|assignDriver/i.test(code), "no booking writes");

  // Booking matcher (read-only, by driver email or mobile; confirmed and upcoming only).
  const jobs: any[] = [
    { id: "j1", paymentReference: "MATNI-1", status: "paid", driverAssignmentStatus: "accepted", driverEmail: "AINE@example.com", tripDate: "2026-11-12", tripTime: "09:00", customerName: "Niamh Smith", pickupLabel: "BT36", returnJourney: false },
    { id: "j2", paymentReference: "MATNI-2", status: "cancelled", driverAssignmentStatus: "accepted", driverEmail: "aine@example.com", tripDate: "2026-11-12", tripTime: "09:00", customerName: "X", pickupLabel: "", returnJourney: false },
    { id: "j3", paymentReference: "MATNI-3", status: "paid", driverAssignmentStatus: "declined", driverEmail: "aine@example.com", tripDate: "2026-11-12", tripTime: "09:00", customerName: "X", pickupLabel: "", returnJourney: false },
    { id: "j4", paymentReference: "MATNI-4", status: "paid", driverAssignmentStatus: "pending", driverMobile: "+44 7700 900201", tripDate: "2026-11-01", tripTime: "09:00", customerName: "Paul", pickupLabel: "", returnJourney: true, returnDate: "2026-11-15", returnTime: "18:00" },
    { id: "j5", paymentReference: "MATNI-5", status: "paid", driverAssignmentStatus: "accepted", driverEmail: "other@example.com", tripDate: "2026-11-12", tripTime: "09:00", customerName: "X", pickupLabel: "", returnJourney: false },
  ];
  const frozen = JSON.stringify(jobs);
  jobs.push(
    // Permanent id wins: same email, but assigned to a different driver account → not this driver.
    { id: "j6", paymentReference: "MATNI-6", status: "paid", driverAssignmentStatus: "accepted", driverAccountId: "drv_someoneelse", driverEmail: "aine@example.com", tripDate: "2026-11-12", tripTime: "10:00", customerName: "X", pickupLabel: "", returnJourney: false },
    // Permanent id match even with different (changed) contact details.
    { id: "j7", paymentReference: "MATNI-7", status: "paid", driverAssignmentStatus: "accepted", driverAccountId: "drv_aine", driverEmail: "old-address@example.com", tripDate: "2026-11-13", tripTime: "10:00", customerName: "Y", pickupLabel: "", returnJourney: false },
  );
  const frozen2 = JSON.stringify(jobs);
  const me = { id: "drv_aine", name: "Aine", email: "aine@example.com", mobile: "07700900201" };
  const found = upcomingBookingsForDriver(jobs, me, "2026-11-10");
  assert.deepEqual(found.map((f) => `${f.reference}:${f.leg}:${f.matchMethod}`), ["MATNI-1:outbound:contact", "MATNI-7:outbound:driver_id", "MATNI-4:return:contact"]);
  assert.equal(JSON.stringify(jobs), frozen2);
  assert.equal(frozen.length > 0, true);
  // Verification of the owner's update.
  assert.deepEqual(checkBookingAssignment(jobs[5], me), { found: true, cancelled: false, assignedToThisDriver: false, otherDriver: "drv_someoneelse" });
  assert.equal(checkBookingAssignment(jobs[6], me).assignedToThisDriver, true);
  assert.equal(checkBookingAssignment(jobs[1], me).cancelled, true);
  assert.equal(checkBookingAssignment(null, me).found, false);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
