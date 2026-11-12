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
const CUSTOMER_FARE = "£185.00"; // must never reach a driver
type Booking = DispatchBooking & { fare: string };
const bookings = new Map<string, Booking>();
function booking(reference: string, date: string, time: string, extra: Partial<Booking> = {}): Booking {
  const b: Booking = {
    reference, status: "paid",
    outbound: { tripDate: date, tripTime: time, pickup: "12 Glen Road, Lisburn, BT28 1AB", dropoff: "Dublin Airport Terminal 2", flightNumber: "EI123" },
    return: null, passengers: 2, suitcases: 2, vehicle: "Saloon", customerFirstName: "Sarah", customerMobile: "07700900555",
    notes: "Child seat", assignedOutsidePortal: false, fare: CUSTOMER_FARE, ...extra,
  };
  bookings.set(reference, b);
  return b;
}
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
  getBooking: async (reference) => bookings.get(reference) ?? null,
  listUpcomingBookings: async () => [...bookings.values()],
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

async function main() {
  // ----- helpers -----
  assert.equal(areaLabel("12 Glen Road, Lisburn, BT28 1AB"), "Lisburn, BT28");
  assert.equal(areaLabel("Dublin Airport Terminal 2"), "Dublin Airport Terminal 2");
  assert.equal(new Date(londonToUtcMs("2026-11-14", "06:30")).toISOString(), "2026-11-14T06:30:00.000Z");
  assert.equal(new Date(londonToUtcMs("2026-07-14", "06:30")).toISOString(), "2026-07-14T05:30:00.000Z", "summer time");

  // ----- not our route / no DB / auth -----
  assert.equal(await handleDriverJobsRequest(new Request("https://w.test/bookings"), env, jobsDeps), null);
  assert.equal((await handleDriverJobsRequest(new Request("https://w.test/owner/driver-jobs"), {}, jobsDeps))?.status, 404, "live Worker (no DRIVER_DB) answers 404");
  assert.equal((await handleDriverJobsRequest(new Request("https://w.test/driver-portal/jobs"), {}, jobsDeps))?.status, 404);
  assert.equal((await call("GET", "/owner/driver-jobs")).status, 401);
  assert.equal((await call("GET", "/driver-portal/jobs")).status, 401);

  const sean = await approvedDriver("Sean Test", "sean@example.com", { reg: "ab12 cde" });
  const mary = await approvedDriver("Mary Test", "mary@example.com", { reg: "XY66 ZZZ" });
  const noReg = await approvedDriver("Noel NoReg", "noel@example.com");
  const away = await approvedDriver("Una Unavailable", "una@example.com", { reg: "UN11 AVL", available: false });
  // A driver session can never use an owner route, and the shared owner key is not a driver session.
  assert.equal((await call("GET", "/owner/driver-jobs", undefined, as(sean.session))).status, 401);
  assert.equal((await call("GET", "/driver-portal/jobs", undefined, owner)).status, 401);

  booking("MATNI-1001", "2026-11-14", "06:30");
  booking("MATNI-1002", "2026-11-15", "09:00", { return: { tripDate: "2026-11-22", tripTime: "18:00", pickup: "Dublin Airport Terminal 2", dropoff: "12 Glen Road, Lisburn, BT28 1AB", flightNumber: "EI456" } });
  booking("MATNI-1003", "2026-11-16", "12:00");
  booking("MATNI-UNPAID", "2026-11-16", "12:00", { status: "awaiting_payment" });
  booking("MATNI-CANCELLED", "2026-11-16", "12:00", { status: "cancelled" });

  // ----- board: what needs a driver -----
  let board = await call("GET", "/owner/driver-jobs", undefined, owner);
  assert.equal(board.status, 200, board.raw);
  assert.deepEqual(board.body.needsDriver.map((n: any) => `${n.reference}:${n.leg}`), ["MATNI-1001:outbound", "MATNI-1002:outbound", "MATNI-1003:outbound", "MATNI-1002:return"]);
  assert.equal(board.body.drivers.find((d: any) => d.id === away.id).canReceiveOffers, false);
  assert.equal(board.body.drivers.find((d: any) => d.id === noReg.id).hasVehicleReg, false);

  // ----- creating offers: validation -----
  const offer = (body: Record<string, unknown>) => call("POST", "/owner/driver-jobs/offers", body, owner);
  assert.equal((await offer({ reference: "MATNI-1001", mode: "fixed", feePence: 50, driverIds: [sean.id] })).status, 400, "fee too small");
  assert.equal((await offer({ reference: "MATNI-1001", mode: "fixed", feePence: 4500.5, driverIds: [sean.id] })).status, 400, "fee must be whole pence");
  assert.equal((await offer({ reference: "MATNI-1001", mode: "fixed", feePence: 4500, driverIds: [] })).status, 400);
  assert.equal((await offer({ reference: "MATNI-1001", mode: "direct", feePence: 4500, driverIds: [sean.id, mary.id] })).status, 400);
  assert.equal((await offer({ reference: "MATNI-NOPE", mode: "fixed", feePence: 4500, driverIds: [sean.id] })).status, 404);
  assert.equal((await offer({ reference: "MATNI-UNPAID", mode: "fixed", feePence: 4500, driverIds: [sean.id] })).status, 409);
  assert.equal((await offer({ reference: "MATNI-CANCELLED", mode: "fixed", feePence: 4500, driverIds: [sean.id] })).status, 409);
  assert.equal((await offer({ reference: "MATNI-1001", leg: "return", mode: "fixed", feePence: 4500, driverIds: [sean.id] })).status, 409, "no return leg");
  // Unavailable drivers are not offered work.
  const onlyAway = await offer({ reference: "MATNI-1001", mode: "fixed", feePence: 4500, driverIds: [away.id] });
  assert.equal(onlyAway.status, 409);
  assert.match(onlyAway.body.refused[0].reason, /unavailable/i);

  // ----- fixed-price offer: first to accept gets it, once only -----
  const fixed = await offer({ reference: "MATNI-1001", mode: "fixed", feePence: 4500, driverIds: [sean.id, mary.id, noReg.id, away.id], note: "Early start" });
  assert.equal(fixed.status, 201, fixed.raw);
  assert.deepEqual(fixed.body.sentTo.map((d: any) => d.driverId).sort(), [sean.id, mary.id, noReg.id].sort());
  assert.equal(fixed.body.refused.length, 1);
  assert.equal(driverEmails.filter((e) => /New job offer/.test(e.subject)).length, 3);
  assert.ok(driverEmails.every((e) => !e.body.includes("Glen Road") && !e.body.includes("Sarah") && !e.body.includes(CUSTOMER_FARE)), "offer email has the area only");
  assert.equal((await offer({ reference: "MATNI-1001", mode: "fixed", feePence: 4500, driverIds: [sean.id] })).status, 409, "one open offer per journey");

  let seanJobs = await call("GET", "/driver-portal/jobs", undefined, as(sean.session));
  assert.equal(seanJobs.status, 200, seanJobs.raw);
  assert.equal(seanJobs.body.offers.length, 1);
  const seen = seanJobs.body.offers[0];
  assert.equal(seen.feeLabel, "£45.00");
  assert.equal(seen.pickupArea, "Lisburn, BT28");
  // Before a driver has the job: no street address, customer name, phone, booking reference or fare.
  for (const secret of ["Glen Road", "Sarah", "07700900555", "MATNI-1001", CUSTOMER_FARE, "185"]) assert.ok(!seanJobs.raw.includes(secret), `offer leaked ${secret}`);
  // A driver who was not sent the offer cannot see or answer it.
  assert.equal((await call("GET", "/driver-portal/jobs", undefined, as(away.session))).body.offers.length, 0);
  assert.equal((await call("POST", "/driver-portal/jobs/offer-response", { offerId: fixed.body.offerId, action: "accept" }, as(away.session))).status, 404);
  // No registration yet → cannot accept.
  const blocked = await call("POST", "/driver-portal/jobs/offer-response", { offerId: fixed.body.offerId, action: "accept" }, as(noReg.session));
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error, /registration/i);
  assert.equal((await call("POST", "/driver-portal/jobs/offer-response", { offerId: fixed.body.offerId, action: "bid", bidPence: 4000 }, as(sean.session))).status, 409, "no bidding on a fixed fee");

  const [a, b] = await Promise.all([
    call("POST", "/driver-portal/jobs/offer-response", { offerId: fixed.body.offerId, action: "accept" }, as(sean.session)),
    call("POST", "/driver-portal/jobs/offer-response", { offerId: fixed.body.offerId, action: "accept" }, as(mary.session)),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409], "exactly one driver gets the job");
  const winner = a.status === 200 ? sean : mary;
  const loser = a.status === 200 ? mary : sean;
  assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM driver_jobs").get() as { n: number }).n, 1);
  assert.equal((await call("POST", "/driver-portal/jobs/offer-response", { offerId: fixed.body.offerId, action: "accept" }, as(winner.session))).status, 409, "double tap does not make a second job");
  // Booking updated, customer told (first name, mobile, registration — the email builder shows part of it).
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].driver?.id, winner.id);
  assert.equal(customerEmails.length, 1);
  assert.equal(customerEmails[0].driver.firstName, winner === sean ? "Sean" : "Mary");
  assert.ok(notices.some((n) => /accepted MATNI-1001/.test(n.title)));
  assert.equal(audit("job.confirmed").length, 1);
  assert.equal(audit("job.customer_driver_details")[0].sent, true);

  // The winner now sees the full job; the other driver sees nothing of it.
  const winJobs = await call("GET", "/driver-portal/jobs", undefined, as(winner.session));
  assert.equal(winJobs.body.offers.length, 0);
  assert.equal(winJobs.body.jobs.length, 1);
  const job1 = winJobs.body.jobs[0];
  assert.equal(job1.pickup, "12 Glen Road, Lisburn, BT28 1AB");
  assert.equal(job1.customerFirstName, "Sarah");
  assert.equal(job1.customerMobile, "07700900555");
  assert.equal(job1.feeLabel, "£45.00");
  assert.equal(job1.nextStatus, "on_the_way");
  assert.ok(!winJobs.raw.includes(CUSTOMER_FARE) && !/fare|margin|quotedPrice|amountPaid/i.test(winJobs.raw), "driver never sees the customer fare");
  const loseJobs = await call("GET", "/driver-portal/jobs", undefined, as(loser.session));
  assert.equal(loseJobs.body.offers.length + loseJobs.body.jobs.length, 0);
  assert.ok(!loseJobs.raw.includes("Glen Road"));

  // ----- status buttons: in order, own job only, location optional -----
  const status = (session: string, jobId: string, next: string, location?: unknown) => call("POST", "/driver-portal/jobs/status", { jobId, status: next, location }, as(session));
  assert.equal((await status(loser.session, job1.id, "on_the_way")).status, 404, "another driver's job");
  assert.equal((await status(winner.session, job1.id, "arrived")).status, 409, "out of order");
  assert.equal((await status(winner.session, job1.id, "on_the_way")).status, 409, "too early (pickup is two days away)");
  clock = new Date("2026-11-14T05:30:00Z");
  assert.equal((await status(winner.session, job1.id, "on_the_way")).status, 200);
  const arrived = await status(winner.session, job1.id, "arrived", { lat: 54.5103, lng: -6.0353, accuracy: 12.4 });
  assert.equal(arrived.body.locationVerified, true);
  // Phone refused to share location: the status still updates.
  const paymentsBefore = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE '%pay%' OR name LIKE '%payout%')").all();
  const done = await status(winner.session, job1.id, "completed", null);
  assert.equal(done.status, 200);
  assert.equal(done.body.locationVerified, false);
  assert.equal((await status(winner.session, job1.id, "completed")).status, 409);
  assert.deepEqual(paymentsBefore, [], "there is no payment table at all in this stage");
  assert.equal(audit("job.completed")[0].paymentTriggered, false);
  assert.equal(audit("job.completed")[0].locationVerified, false);
  assert.equal(audit("job.arrived")[0].accuracyMetres, 12.4);
  board = await call("GET", "/owner/driver-jobs", undefined, owner);
  const recent1 = board.body.recent.find((j: any) => j.id === job1.id);
  assert.equal(recent1.arrivedLocation.verified, true);
  assert.equal(recent1.arrivedLocation.lat, 54.5103);
  assert.equal(recent1.completedLocation.verified, false);
  assert.match(recent1.payment, /your approval/i);
  // Location evidence is the owner's: the driver's own view has none of it.
  const afterDone = await call("GET", "/driver-portal/jobs", undefined, as(winner.session));
  assert.ok(!afterDone.raw.includes("54.5103") && !/Location|accuracy/i.test(afterDone.raw));
  assert.equal(afterDone.body.past.length, 1);
  assert.ok(!afterDone.raw.includes("07700900555"), "customer phone is gone once the job is finished");
  clock = new Date("2026-11-12T11:00:00Z");

  // ----- bids: private, the owner chooses, lowest never wins by itself -----
  const bids = await offer({ reference: "MATNI-1002", mode: "bids", driverIds: [sean.id, mary.id] });
  assert.equal(bids.status, 201, bids.raw);
  assert.equal((await call("POST", "/driver-portal/jobs/offer-response", { offerId: bids.body.offerId, action: "accept" }, as(sean.session))).status, 409);
  assert.equal((await call("POST", "/driver-portal/jobs/offer-response", { offerId: bids.body.offerId, action: "bid", bidPence: 99 }, as(sean.session))).status, 400);
  assert.equal((await call("POST", "/driver-portal/jobs/offer-response", { offerId: bids.body.offerId, action: "bid", bidPence: 9000 }, as(sean.session))).status, 200);
  assert.equal((await call("POST", "/driver-portal/jobs/offer-response", { offerId: bids.body.offerId, action: "bid", bidPence: 11000, note: "Estate car" }, as(mary.session))).status, 200);
  const maryView = await call("GET", "/driver-portal/jobs", undefined, as(mary.session));
  assert.equal(maryView.body.offers[0].myBidLabel, "£110.00");
  assert.ok(!maryView.raw.includes("9000") && !maryView.raw.includes("£90") && !maryView.raw.includes("Sean"), "a driver never sees another driver's bid");
  assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM driver_jobs WHERE booking_reference = 'MATNI-1002'").get() as { n: number }).n, 0, "nothing is awarded automatically");
  board = await call("GET", "/owner/driver-jobs", undefined, owner);
  const bidOffer = board.body.offers.find((o: any) => o.id === bids.body.offerId);
  assert.deepEqual(bidOffer.recipients.map((r: any) => r.bidLabel), ["£90.00", "£110.00"]);
  // The owner picks the higher bid.
  assert.equal((await call("POST", "/owner/driver-jobs/offers/award", { offerId: bids.body.offerId, driverId: noReg.id }, owner)).status, 409, "not a bidder");
  const award = await call("POST", "/owner/driver-jobs/offers/award", { offerId: bids.body.offerId, driverId: mary.id }, owner);
  assert.equal(award.status, 200, award.raw);
  assert.equal(award.body.feeLabel, "£110.00");
  assert.equal((await call("POST", "/owner/driver-jobs/offers/award", { offerId: bids.body.offerId, driverId: sean.id }, owner)).status, 409, "already awarded");
  assert.equal(audit("job.confirmed")[1].chosenBy, "owner");
  assert.ok(driverEmails.some((e) => e.to === "mary@example.com" && /You have the job/.test(e.subject)));
  assert.equal((await call("GET", "/driver-portal/jobs", undefined, as(sean.session))).body.offers.length, 0, "losing bidder's offer disappears");

  // ----- a suspended driver's bid cannot be chosen -----
  const bids2 = await offer({ reference: "MATNI-1002", leg: "return", mode: "bids", driverIds: [sean.id] });
  assert.equal((await call("POST", "/driver-portal/jobs/offer-response", { offerId: bids2.body.offerId, action: "bid", bidPence: 8000 }, as(sean.session))).status, 200);
  assert.equal((await call("POST", "/owner/driver-accounts/status", { driverId: sean.id, action: "suspend", reason: "Licence query" }, owner)).status, 200);
  assert.equal((await call("GET", "/driver-portal/jobs", undefined, as(sean.session))).status, 401, "suspension ends the session");
  const refusedAward = await call("POST", "/owner/driver-jobs/offers/award", { offerId: bids2.body.offerId, driverId: sean.id }, owner);
  assert.equal(refusedAward.status, 409);
  assert.match(refusedAward.body.error, /not an approved driver/);
  assert.equal((await offer({ reference: "MATNI-1003", mode: "direct", feePence: 5000, driverIds: [sean.id] })).status, 409, "no work to a suspended driver");
  assert.equal((await call("POST", "/owner/driver-jobs/offers/withdraw", { offerId: bids2.body.offerId }, owner)).status, 200);
  assert.equal((await call("POST", "/owner/driver-jobs/offers/withdraw", { offerId: bids2.body.offerId }, owner)).status, 409);

  // ----- direct assignment: driver must accept; a decline alerts the owner, booking untouched -----
  const direct = await offer({ reference: "MATNI-1003", mode: "direct", feePence: 5000, driverIds: [away.id] });
  assert.equal(direct.status, 201, "direct assignment may go to an approved driver who is switched to unavailable");
  const noticesBefore = notices.length;
  const assignmentsBefore = assignments.length;
  assert.equal((await call("POST", "/driver-portal/jobs/offer-response", { offerId: direct.body.offerId, action: "decline" }, as(away.session))).status, 200);
  assert.equal(assignments.length, assignmentsBefore, "a decline never touches the booking");
  assert.equal(bookings.get("MATNI-1003")!.status, "paid");
  const declineNotice = notices.slice(noticesBefore).find((n) => /declined MATNI-1003/.test(n.title));
  assert.equal(declineNotice?.priority, "high");

  // ----- repeating owner alert: reminders until acknowledged, then email, and acknowledging stops them -----
  let summary = await call("GET", "/owner/driver-jobs/summary", undefined, owner);
  assert.equal(summary.body.unacknowledged, 1);
  const escId = summary.body.escalations[0].id as string;
  const reminders = () => notices.filter((n) => n.tag.startsWith(`${escId}-`)).length;
  minutes(1);
  await call("POST", "/owner/driver-jobs/maintenance", {}, owner);
  assert.equal(reminders(), 0, "not due yet");
  minutes(2);
  await call("POST", "/owner/driver-jobs/maintenance", {}, owner);
  assert.equal(reminders(), 1);
  assert.equal(ownerEmails.length, 0);
  minutes(6);
  await call("POST", "/owner/driver-jobs/maintenance", {}, owner);
  assert.equal(reminders(), 2);
  assert.equal(ownerEmails.length, 1, `email from reminder ${ESCALATION_EMAIL_FROM_LEVEL}`);
  assert.equal((await call("POST", "/owner/driver-jobs/escalations/ack", { id: escId }, owner)).body.stillOpen, true);
  minutes(120);
  await call("POST", "/owner/driver-jobs/maintenance", {}, owner);
  assert.equal(reminders(), 2, "acknowledged: no more reminders");
  summary = await call("GET", "/owner/driver-jobs/summary", undefined, owner);
  assert.equal(summary.body.unacknowledged, 0);
  assert.equal(summary.body.escalations.length, 1, "acknowledged but still open until dealt with");
  assert.equal((await call("POST", "/owner/driver-jobs/escalations/close", { id: escId, note: "" }, owner)).status, 400);

  // Re-offer the declined job; when a driver takes it the alert closes by itself.
  const direct2 = await offer({ reference: "MATNI-1003", mode: "direct", feePence: 5500, driverIds: [mary.id] });
  assert.equal(direct2.status, 201, direct2.raw);
  assert.equal((await call("POST", "/driver-portal/jobs/offer-response", { offerId: direct2.body.offerId, action: "accept" }, as(mary.session))).status, 200);

  // ----- urgent driver report: instant high-priority alert; closes when marked handled -----
  const report = await call("POST", "/driver-portal/account/contact-office", { message: "Flat tyre on the M1", category: "breakdown" }, as(mary.session));
  assert.equal(report.status, 201);
  const urgentNotice = notices[notices.length - 1];
  assert.match(urgentNotice.title, /Vehicle breakdown: Mary Test/);
  assert.equal(urgentNotice.priority, "high");
  assert.equal(bookings.get("MATNI-1003")!.status, "paid", "a report never cancels a booking");
  assert.equal((sqlite.prepare("SELECT status FROM driver_jobs WHERE booking_reference = 'MATNI-1003'").get() as { status: string }).status, "confirmed", "…or removes the driver");
  summary = await call("GET", "/owner/driver-jobs/summary", undefined, owner);
  const urgentEsc = summary.body.escalations.find((e: any) => e.sourceType === "message");
  assert.equal((await call("POST", "/owner/driver-jobs/escalations/close", { id: urgentEsc.id, note: "Done it" }, owner)).status, 409, "must be handled on the report itself");
  assert.equal((await call("POST", "/owner/driver-accounts/messages/handled", { messageId: report.body.messageId }, owner)).status, 200);
  summary = await call("GET", "/owner/driver-jobs/summary", undefined, owner);
  assert.ok(!summary.body.escalations.some((e: any) => e.sourceType === "message"));

  // ----- booking change → driver must answer; can't do → owner alert, driver stays assigned -----
  const b1002 = bookings.get("MATNI-1002")!;
  b1002.outbound = { ...b1002.outbound, tripTime: "07:15" };
  let maryJobs = await call("GET", "/driver-portal/jobs", undefined, as(mary.session));
  let changed = maryJobs.body.jobs.find((j: any) => j.reference === "MATNI-1002");
  assert.equal(changed.tripTime, "09:00", "job keeps the old time until the driver answers");
  assert.equal(changed.change.to.tripTime, "07:15");
  assert.ok(driverEmails.some((e) => e.to === "mary@example.com" && /please answer/.test(e.subject)));
  await call("GET", "/driver-portal/jobs", undefined, as(mary.session));
  assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM job_change_requests").get() as { n: number }).n, 1, "the same change is only asked once");
  // Unanswered → the owner is alerted.
  minutes(31);
  const maint = await call("POST", "/owner/driver-jobs/maintenance", {}, owner);
  assert.equal(maint.body.unansweredChanges, 1);
  assert.ok(notices.some((n) => /hasn't answered the change to MATNI-1002/.test(n.title)));
  const cant = await call("POST", "/driver-portal/jobs/change-response", { changeId: changed.change.id, action: "cant_do" }, as(mary.session));
  assert.equal(cant.status, 200);
  assert.equal(cant.body.stillAssigned, true);
  assert.equal(notices[notices.length - 1].priority, "high");
  assert.match(notices[notices.length - 1].title, /can't do the new time for MATNI-1002/);
  assert.equal((sqlite.prepare("SELECT status FROM driver_jobs WHERE booking_reference = 'MATNI-1002'").get() as { status: string }).status, "confirmed", "never removed automatically");
  assert.equal(audit("job.change_cant_do")[0].assignmentRemoved, false);
  board = await call("GET", "/owner/driver-jobs", undefined, owner);
  const cantJob = board.body.jobs.find((j: any) => j.reference === "MATNI-1002");
  assert.equal(cantJob.change.status, "cant_do");
  assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM job_change_requests").get() as { n: number }).n, 1, "not asked again after a refusal");
  const cantEsc = board.body.escalations.find((e: any) => /can't do/.test(e.title));
  assert.equal((await call("POST", "/owner/driver-jobs/escalations/close", { id: cantEsc.id, note: "Sorted it" }, owner)).status, 409, "can't be waved away while unresolved");

  // The owner releases the driver (reason required) and can then offer the job again.
  assert.equal((await call("POST", "/owner/driver-jobs/jobs/release", { jobId: cantJob.id, reason: "" }, owner)).status, 400);
  assert.equal((await offer({ reference: "MATNI-1002", mode: "fixed", feePence: 9500, driverIds: [mary.id] })).status, 409, "release first");
  const release = await call("POST", "/owner/driver-jobs/jobs/release", { jobId: cantJob.id, reason: "Driver can't do 07:15" }, owner);
  assert.equal(release.status, 200);
  assert.deepEqual([release.body.customerTold, release.body.bookingChanged], [false, false]);
  assert.equal(assignments[assignments.length - 1].driver, null);
  assert.equal(bookings.get("MATNI-1002")!.status, "paid", "the customer booking is untouched");
  board = await call("GET", "/owner/driver-jobs", undefined, owner);
  assert.ok(!board.body.escalations.some((e: any) => /can't do/.test(e.title)), "alert closes once the driver is released");
  assert.ok(board.body.needsDriver.some((n: any) => n.reference === "MATNI-1002" && n.leg === "outbound"));
  maryJobs = await call("GET", "/driver-portal/jobs", undefined, as(mary.session));
  assert.match(maryJobs.body.past.find((j: any) => j.status === "released").note, /office took you off/);
  // The released job's identity can never be rewritten or deleted.
  assert.throws(() => sqlite.prepare("UPDATE driver_jobs SET fee_pence = 1 WHERE id = ?").run(cantJob.id), /permanent/);
  assert.throws(() => sqlite.prepare("DELETE FROM driver_jobs WHERE id = ?").run(cantJob.id), /permanent/);

  // ----- accept a change -----
  const b1003 = bookings.get("MATNI-1003")!;
  b1003.outbound = { ...b1003.outbound, tripDate: "2026-11-17", tripTime: "13:30" };
  maryJobs = await call("GET", "/driver-portal/jobs", undefined, as(mary.session));
  changed = maryJobs.body.jobs.find((j: any) => j.reference === "MATNI-1003");
  assert.equal((await call("POST", "/driver-portal/jobs/change-response", { changeId: changed.change.id, action: "accept" }, as(mary.session))).status, 200);
  assert.equal((await call("POST", "/driver-portal/jobs/change-response", { changeId: changed.change.id, action: "cant_do" }, as(mary.session))).status, 409);
  maryJobs = await call("GET", "/driver-portal/jobs", undefined, as(mary.session));
  changed = maryJobs.body.jobs.find((j: any) => j.reference === "MATNI-1003");
  assert.deepEqual([changed.tripDate, changed.tripTime, changed.change], ["2026-11-17", "13:30", null]);
  // A change that is undone before the driver answers is withdrawn.
  b1003.outbound = { ...b1003.outbound, tripTime: "15:00" };
  await call("GET", "/owner/driver-jobs", undefined, owner);
  b1003.outbound = { ...b1003.outbound, tripTime: "13:30" };
  maryJobs = await call("GET", "/driver-portal/jobs", undefined, as(mary.session));
  assert.equal(maryJobs.body.jobs.find((j: any) => j.reference === "MATNI-1003").change, null);

  // ----- suspending a driver with a portal job: listed for manual review, job untouched -----
  const suspend = await call("POST", "/owner/driver-accounts/status", { driverId: mary.id, action: "suspend", reason: "Insurance lapsed" }, owner);
  assert.equal(suspend.status, 200);
  assert.deepEqual(suspend.body.reviewBookings.map((r: any) => `${r.reference}:${r.leg}:${r.matchMethod}`), ["MATNI-1003:outbound:driver_id"]);
  assert.equal((sqlite.prepare("SELECT status FROM driver_jobs WHERE booking_reference = 'MATNI-1003' AND driver_id = ?").get(mary.id) as { status: string }).status, "confirmed", "suspension never removes a job by itself");
  assert.equal(bookings.get("MATNI-1003")!.status, "paid");

  // ----- owner cancels the customer booking → the job closes and the driver is told -----
  assert.equal((await call("POST", "/owner/driver-accounts/status", { driverId: mary.id, action: "reinstate" }, owner)).status, 200);
  bookings.get("MATNI-1003")!.status = "cancelled";
  await call("GET", "/owner/driver-jobs", undefined, owner);
  assert.equal((sqlite.prepare("SELECT status FROM driver_jobs WHERE booking_reference = 'MATNI-1003'").get() as { status: string }).status, "booking_cancelled");
  assert.ok(driverEmails.some((e) => /Job cancelled/.test(e.subject)));

  // ----- an offer nobody takes expires and the owner is told -----
  booking("MATNI-1004", "2026-11-13", "20:00");
  const dead = await offer({ reference: "MATNI-1004", mode: "fixed", feePence: 4000, driverIds: [noReg.id], expiresInMinutes: 30 });
  assert.equal(dead.status, 201, dead.raw);
  minutes(31);
  assert.equal((await call("POST", "/driver-portal/jobs/offer-response", { offerId: dead.body.offerId, action: "decline" }, as(noReg.session))).status, 409, "closed");
  const expiry = await call("POST", "/owner/driver-jobs/maintenance", {}, owner);
  assert.equal(expiry.body.expiredOffers, 1);
  const expiredNotice = notices.find((n) => /No driver yet for MATNI-1004/.test(n.title));
  assert.equal(expiredNotice?.priority, "high", "pickup is within 48 hours");
  // An offer can never stay open past the pickup time.
  booking("MATNI-1005", "2026-11-13", "02:00");
  clock = new Date("2026-11-13T01:00:00Z");
  const late = await offer({ reference: "MATNI-1005", mode: "fixed", feePence: 4000, driverIds: [noReg.id], expiresInMinutes: 600 });
  assert.equal(late.body.expiresAt, "2026-11-13T02:00:00.000Z");
  clock = new Date("2026-11-13T03:00:00Z");
  assert.equal((await offer({ reference: "MATNI-1005", mode: "fixed", feePence: 4000, driverIds: [noReg.id] })).status, 409, "pickup time has passed");

  // ----- booking → dispatch view never carries the fare -----
  const view = toDispatchBooking({
    id: "job_1", createdAt: "", status: "paid", kind: "booking-request", customerName: "Sarah Jones", customerEmail: "s@example.com", customerMobile: "07700900555",
    tripLabel: "", pickupLabel: "A", dropoffLabel: "B", returnJourney: true, tripDate: "2026-12-01", tripTime: "10:00", returnDate: "2026-12-08", returnTime: "11:00",
    passengers: 2, suitcases: 1, vehicle: "Saloon", quotedPrice: "£185.00", amountPaidLabel: "£185.00", isAirportTrip: true, paymentReference: "MATNI-9",
    driverAssignmentStatus: "accepted", driverEmail: "old@example.com",
  });
  assert.ok(!JSON.stringify(view).includes("185"));
  assert.equal(view.customerFirstName, "Sarah");
  assert.deepEqual([view.return?.pickup, view.return?.dropoff], ["B", "A"]);
  assert.equal(view.assignedOutsidePortal, true);

  // ----- audit log has the whole story -----
  const actions = new Set((sqlite.prepare("SELECT DISTINCT action FROM audit_log").all() as { action: string }[]).map((r) => r.action));
  for (const expected of [
    "offer.created", "offer.declined", "offer.all_declined", "offer.bid", "offer.withdrawn", "offer.expired", "job.confirmed", "job.customer_driver_details",
    "job.on_the_way", "job.arrived", "job.completed", "job.change_requested", "job.change_accepted", "job.change_cant_do", "job.change_withdrawn",
    "job.released", "job.booking_cancelled", "owner_alert.raised", "owner_alert.reminder", "owner_alert.acknowledged", "driver.vehicle_reg_updated",
  ]) assert.ok(actions.has(expected), `audit missing ${expected}`);
  assert.throws(() => sqlite.prepare("DELETE FROM audit_log").run(), /append-only/);

  console.log("check-driver-jobs: all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
