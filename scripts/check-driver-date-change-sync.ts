/**
 * Stage 2 driver jobs — offers, bids, direct assignment, job status, change requests and
 * repeating owner alerts, against a real SQLite database (node:sqlite) that mimics the D1 API.
 * Run: npx tsx scripts/check-driver-jobs.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  DRIVER_ACCOUNT_SESSION_HEADER,
  handleDriverAccountsRequest,
  type D1Like,
  type D1PreparedLike,
} from "../workers/addresses/src/driver-accounts";
import {
  areaLabel,
  ESCALATION_EMAIL_FROM_LEVEL,
  handleDriverJobsRequest,
  londonToUtcMs,
  raiseUrgentReportEscalation,
  type AssignedDriver,
  type DispatchBooking,
  type DriverJobsDeps,
  type OwnerNotice,
} from "../workers/addresses/src/driver-jobs";
import { toDispatchBooking } from "../workers/addresses/src/driver-jobs-wiring";
import { getBookingJob, listAllBookingJobs, listBookingJobsForDate, saveBookingJob } from "../workers/addresses/src/booking-job-store";
import { syncBookingJobFromAmendment } from "../workers/addresses/src/booking-job-sync";

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
for (const file of readdirSync("workers/addresses/migrations/driver-db").sort()) {
  sqlite.exec(readFileSync(`workers/addresses/migrations/driver-db/${file}`, "utf8"));
}
const env = { DRIVER_DB: d1(sqlite) };

let clock = new Date("2026-11-12T10:00:00Z");
let tokenN = 0;

// ----- stand-ins for the rest of the Worker -----
const mem = new Map<string, string>();
const kv = {
  get: async (k: string, t?: string) => { const v = mem.get(k); return v === undefined ? null : t === "json" ? JSON.parse(v) : v; },
  put: async (k: string, v: string) => { mem.set(k, v); },
  delete: async (k: string) => { mem.delete(k); },
  list: async ({ prefix = "" }: { prefix?: string } = {}) => ({ keys: [...mem.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
} as unknown as KVNamespace;
async function makeJob(ref: string, extra: Record<string, unknown> = {}) {
  const job: any = {
    id: ref, paymentReference: ref, status: "paid", customerName: "Sarah Test", customerMobile: "07700900555",
    tripLabel: "x", pickupLabel: "12 Glen Road, Lisburn, BT28 1AB", dropoffLabel: "Dublin Airport Terminal 2", returnJourney: false,
    tripDate: "2026-11-15", tripTime: "09:00", passengers: 2, suitcases: 2, vehicle: "Saloon", isAirportTrip: true,
    flightNumber: "EI123", createdAt: "2026-11-01T10:00:00Z", ...extra,
  };
  await saveBookingJob(kv, job);
  return job;
}
type Booking = DispatchBooking;
const assignments: Array<{ reference: string; leg: string; driver: AssignedDriver | null }> = [];
const customerEmails: Array<{ reference: string; leg: string; driver: AssignedDriver }> = [];
const notices: OwnerNotice[] = [];
const ownerEmails: string[] = [];
const driverEmails: Array<{ to: string; subject: string; body: string }> = [];

const base = {
  ownerAuthorized: (r: Request) => r.headers.get("X-Owner-Key") === "staging-owner",
  corsHeaders: () => ({ "Access-Control-Allow-Origin": "https://matni-dashboard-staging.pages.dev", "Access-Control-Allow-Headers": "Content-Type" }),
  now: () => clock,
};
const jobsDeps: DriverJobsDeps = {
  ...base,
  getBooking: async (reference) => { const j = await getBookingJob(kv, reference); return j ? toDispatchBooking(j) : null; },
  listUpcomingBookings: async () => (await listAllBookingJobs(kv)).map(toDispatchBooking),
  recordAssignment: async (reference, leg, driver) => void assignments.push({ reference, leg, driver }),
  sendCustomerDriverDetails: async (reference, leg, driver) => {
    customerEmails.push({ reference, leg, driver });
    return { sent: true };
  },
  notifyOwner: async (n) => void notices.push(n),
  emailOwner: async (subject) => void ownerEmails.push(subject),
  emailDriver: async (d, subject, body) => void driverEmails.push({ to: d.email, subject, body }),
};
const accountDeps = {
  ...base,
  randomToken: (prefix: string) => `${prefix}test${++tokenN}`,
  onUrgentReport: (report: Parameters<typeof raiseUrgentReportEscalation>[2]) => raiseUrgentReportEscalation(env, jobsDeps, report),
};

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const request = new Request(`https://w.test${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = (await handleDriverJobsRequest(request, env, jobsDeps)) ?? (await handleDriverAccountsRequest(request, env, accountDeps));
  assert.ok(res, `no response for ${path}`);
  const raw = await res.text();
  let parsed: Record<string, any> = {};
  try { parsed = JSON.parse(raw); } catch { /* empty */ }
  return { status: res.status, body: parsed, raw };
}
const owner = { "X-Owner-Key": "staging-owner" };
const as = (token: string) => ({ [DRIVER_ACCOUNT_SESSION_HEADER]: token });

/** Invite → apply → documents accepted → approved → available. Returns id and session. */
async function approvedDriver(name: string, email: string, options: { reg?: string; available?: boolean } = {}) {
  const inv = await call("POST", "/owner/driver-accounts/invite", { name, email, mobile: "07700 900" + String(100 + tokenN).slice(-3) }, owner);
  assert.equal(inv.status, 201, inv.raw);
  const acc = await call("POST", "/driver-portal/account/accept-invite", {
    token: inv.body.inviteToken, operatorName: `${name} Cars`, operatorLicenceNumber: "OP-1", confirmOwnOperatorLicence: true, vehicleSummary: "Skoda Superb",
  });
  assert.equal(acc.status, 200, acc.raw);
  const session = acc.body.sessionToken as string;
  for (const kind of ["operator_licence", "phv_driver_licence", "vehicle_licence", "insurance"]) {
    const r = await call("POST", "/driver-portal/account/documents", { kind, expiresOn: "2027-06-30", reference: "REF" }, as(session));
    assert.equal((await call("POST", "/owner/driver-accounts/document-review", { documentId: r.body.documentId, decision: "accept" }, owner)).status, 200);
  }
  assert.equal((await call("POST", "/owner/driver-accounts/status", { driverId: inv.body.driverId, action: "approve" }, owner)).status, 200);
  if (options.available !== false) assert.equal((await call("POST", "/driver-portal/account/availability", { available: true }, as(session))).status, 200);
  if (options.reg) assert.equal((await call("POST", "/driver-portal/jobs/vehicle", { vehicleReg: options.reg }, as(session))).status, 200);
  return { id: inv.body.driverId as string, session, email };
}

function audit(action: string) {
  return (sqlite.prepare("SELECT detail FROM audit_log WHERE action = ? ORDER BY seq").all(action) as { detail: string }[]).map((r) => JSON.parse(r.detail));
}
const minutes = (n: number) => { clock = new Date(clock.getTime() + n * 60_000); };

const rows = <T,>(sql: string, ...p: unknown[]) => sqlite.prepare(sql).all(...(p as never[])) as T[];
const jobRow = (ref: string) => rows<any>("SELECT * FROM driver_jobs WHERE booking_reference = ?", ref);

async function main() {
  const mary = await approvedDriver("Mary Test", "mary@example.com", { reg: "XY66 ZZZ" });
  const offer = (body: Record<string, unknown>) => call("POST", "/owner/driver-jobs/offers", body, owner);
  const respond = (offerId: string) => call("POST", "/driver-portal/jobs/offer-response", { offerId, action: "accept" }, as(mary.session));
  const portal = () => call("GET", "/driver-portal/jobs", undefined, as(mary.session));
  const notify = async (d: { email: string; name: string }, subject: string, body: string) => void driverEmails.push({ to: d.email, subject, body });
  const amend = (ref: string, fields: Record<string, unknown>) => syncBookingJobFromAmendment(kv, { paymentReference: ref }, fields as never, notify);

  // Ordinary AIRPORT booking (not a port) and a cruise booking: both must behave the same.
  await makeJob("AIR-1");
  await makeJob("CRZ-1", { pickupLabel: "Belfast Cruise Terminal, Airport Rd W", dropoffLabel: "Belfast", isAirportTrip: false, flightNumber: undefined, sailingDetails: "MSC Virtuosa", portPickupNote: "Port Pass gate", tripDate: "2026-11-16" });
  for (const ref of ["AIR-1", "CRZ-1"]) {
    const o = await offer({ reference: ref, mode: "direct", feePence: 5000, driverIds: [mary.id] });
    assert.equal(o.status, 201, o.raw);
    assert.equal((await respond(o.body.offerId)).status, 200);
  }
  assert.equal(jobRow("AIR-1").length, 1);
  // Mirror what recordAssignment does in production (stand-in deps only record the call).
  for (const ref of ["AIR-1", "CRZ-1"]) {
    await saveBookingJob(kv, { ...(await getBookingJob(kv, ref))!, driverAccountId: mary.id, driverFirstName: "Mary", driverEmail: "mary@example.com", driverAssignmentStatus: "accepted" });
  }
  const origIds = { air: jobRow("AIR-1")[0].id, crz: jobRow("CRZ-1")[0].id };
  const driverMailsBefore = driverEmails.length;

  // 1. Date change on the airport booking: KV job moves index; confirmed D1 schedule unchanged until accepted.
  assert.ok((await listBookingJobsForDate(kv, "2026-11-15")).some((j) => j.id === "AIR-1"));
  await amend("AIR-1", { tripDate: "2026-11-18", tripTime: "11:15" });
  assert.ok(!(await listBookingJobsForDate(kv, "2026-11-15")).some((j) => j.id === "AIR-1"), "removed from the previous date index");
  assert.ok((await listBookingJobsForDate(kv, "2026-11-18")).some((j) => j.id === "AIR-1"), "appears under the new date");
  assert.equal(((await getBookingJob(kv, "AIR-1")) as any).paymentReference, "AIR-1", "original reference preserved");
  assert.equal(mem.get("booking-job-day:2026-11-15"), "[]", "old index emptied, not duplicated");
  let jobs = await portal();
  let air = jobs.body.jobs.find((j: any) => j.reference === "AIR-1");
  assert.deepEqual([air.tripDate, air.tripTime], ["2026-11-15", "09:00"], "PENDING amendment does not change the confirmed schedule");
  assert.equal(air.change.to.tripDate, "2026-11-18");
  assert.equal(jobRow("AIR-1").length, 1, "no duplicate job while pending");
  assert.equal(driverEmails.length - driverMailsBefore, 1, "exactly one change email");
  assert.ok(/please answer/.test(driverEmails[driverEmails.length - 1].subject));

  // 2. Re-saving the same amendment: no second job, change request or email.
  await amend("AIR-1", { tripDate: "2026-11-18", tripTime: "11:15" });
  await portal();
  assert.equal(rows<any>("SELECT * FROM job_change_requests").length, 1);
  assert.equal(jobRow("AIR-1").length, 1);
  assert.equal(driverEmails.length - driverMailsBefore, 1);

  // 3. Driver accepts: same job id, new date/time; availability data (D1 row) now on the new date.
  assert.equal((await call("POST", "/driver-portal/jobs/change-response", { changeId: air.change.id, action: "accept" }, as(mary.session))).status, 200);
  jobs = await portal();
  air = jobs.body.jobs.find((j: any) => j.reference === "AIR-1");
  assert.deepEqual([air.tripDate, air.tripTime, air.change], ["2026-11-18", "11:15", null]);
  assert.equal(jobRow("AIR-1").length, 1, "no duplicate after accept");
  assert.equal(jobRow("AIR-1")[0].id, origIds.air, "same driver job id");
  assert.equal(rows<any>("SELECT * FROM driver_jobs WHERE trip_date = '2026-11-15' AND booking_reference = 'AIR-1'").length, 0, "nothing left on the old date");

  // 4. Cruise booking date change declined: schedule stays; KV booking and D1 job disagree only visibly (owner alert path), no duplicates.
  await amend("CRZ-1", { tripDate: "2026-11-20" });
  jobs = await portal();
  const crz = jobs.body.jobs.find((j: any) => j.reference === "CRZ-1");
  assert.equal(crz.tripDate, "2026-11-16", "pending: confirmed schedule untouched");
  assert.equal((await call("POST", "/driver-portal/jobs/change-response", { changeId: crz.change.id, action: "cant_do" }, as(mary.session))).status, 200);
  jobs = await portal();
  const crz2 = jobs.body.jobs.find((j: any) => j.reference === "CRZ-1");
  assert.equal(crz2.tripDate, "2026-11-16", "rejected: confirmed schedule unchanged");
  assert.equal(jobRow("CRZ-1").length, 1);
  assert.equal(rows<any>("SELECT * FROM job_change_requests WHERE job_id = ?", origIds.crz).length, 1, "not asked again after refusal");

  // 5. Notes-only amendments reach the driver for BOTH airport and cruise bookings, once each.
  const before = driverEmails.length;
  await amend("AIR-1", { flightNumber: "BA9999" });
  assert.equal((await getBookingJob(kv, "AIR-1"))!.flightNumber, "BA9999");
  await amend("CRZ-1", { sailingDetails: "Celebrity Silhouette", portPickupNote: "Terminal door B" });
  await amend("CRZ-1", { sailingDetails: "Celebrity Silhouette", portPickupNote: "Terminal door B" });
  const added = driverEmails.slice(before);
  assert.equal(added.filter((e) => /Updated pickup details/.test(e.subject)).length, 1, "one note email for the cruise change, none for the repeat");
  assert.ok(added.some((e) => /Celebrity Silhouette/.test(e.body) && /Terminal door B/.test(e.body)));
  assert.match(toDispatchBooking((await getBookingJob(kv, "CRZ-1"))!).notes, /Cruise ship \/ ferry: Celebrity Silhouette/);
  assert.match(toDispatchBooking((await getBookingJob(kv, "CRZ-1"))!).notes, /Pickup point: Terminal door B/);
  assert.equal(jobRow("AIR-1").length + jobRow("CRZ-1").length, 2, "still exactly one driver job each");

  console.log("PASS driver date-change index, pending/accepted/rejected, airport + cruise sync");
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAIL", e); process.exit(1); });
