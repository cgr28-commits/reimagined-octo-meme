/**
 * Stage 2 — getting jobs to drivers (staging only).
 *
 * Scope: fixed-price offers, private bids (the owner always chooses), direct assignment,
 * the driver's own jobs with On the way / Arrived / Complete, private location evidence,
 * Accept Change / Can't Do New Time on material booking changes, and owner alerts that
 * repeat until acknowledged.
 *
 * Rules that hold everywhere in this file:
 * - A driver only ever sees their own fee — never the customer fare or the margin.
 * - Completing a job records it. It never pays anyone (payments are Stage 3, owner-approved).
 * - Nothing here cancels, refunds or re-prices a customer booking.
 * - A driver is only taken off a job by the owner (release), never automatically.
 *
 * Only active when the Worker has a DRIVER_DB (D1) binding. Production has none, so every
 * route here answers 404 there.
 */
import {
  HttpError,
  auditStatement,
  canReceiveOffers,
  corsWithSessionHeader,
  getDocuments,
  getDriver,
  json,
  missingForApproval,
  newId,
  readJson,
  requireSession,
  text,
  ymd,
  type Ctx as AccountsCtx,
  type D1Like,
  type D1PreparedLike,
  type DriverAccountsEnv,
  type DriverRow,
} from "./driver-accounts";

export type DispatchLeg = { tripDate: string; tripTime: string; pickup: string; dropoff: string; flightNumber: string };

/** The parts of a customer booking that dispatch needs. Deliberately has no fare. */
export type DispatchBooking = {
  reference: string;
  status: "awaiting_payment" | "paid" | "cancelled";
  outbound: DispatchLeg;
  return: DispatchLeg | null;
  passengers: number;
  suitcases: number;
  vehicle: string;
  customerFirstName: string;
  customerMobile: string;
  notes: string;
  /** True when the booking already has a driver arranged outside this portal (older email flow). */
  assignedOutsidePortal: boolean;
};

export type AssignedDriver = { id: string; firstName: string; email: string; mobile: string; vehicleReg: string; vehicle: string; feePence: number };

export type OwnerNotice = { title: string; body: string; url: string; tag: string; priority: "high" | "normal" };

export type DriverJobsDeps = {
  ownerAuthorized: (request: Request) => boolean;
  corsHeaders: (origin: string | null) => HeadersInit;
  now?: () => Date;
  getBooking: (reference: string) => Promise<DispatchBooking | null>;
  listUpcomingBookings: (today: string) => Promise<DispatchBooking[]>;
  /** Records (or clears, with null) the driver on the booking itself. */
  recordAssignment?: (reference: string, leg: "outbound" | "return", driver: AssignedDriver | null) => Promise<void>;
  /** Customer email: driver first name, mobile and partial registration. */
  sendCustomerDriverDetails?: (reference: string, leg: "outbound" | "return", driver: AssignedDriver) => Promise<{ sent: boolean; reason?: string }>;
  notifyOwner?: (notice: OwnerNotice) => Promise<void>;
  emailOwner?: (subject: string, body: string) => Promise<void>;
  emailDriver?: (driver: { name: string; email: string }, subject: string, body: string) => Promise<void>;
};

export const OFFER_MODES = ["fixed", "bids", "direct"] as const;
export type OfferMode = (typeof OFFER_MODES)[number];

const MIN_FEE_PENCE = 100;
const MAX_FEE_PENCE = 200_000;
const DEFAULT_OFFER_MINUTES = 120;
const MAX_OFFER_MINUTES = 7 * 24 * 60;
/** Minutes after each notification before the next reminder of an unacknowledged high-priority alert. */
export const ESCALATION_STEPS_MINUTES = [2, 5, 10, 15, 15, 15, 30, 30];
/** From this reminder onwards the owner is emailed as well as notified on the phone. */
export const ESCALATION_EMAIL_FROM_LEVEL = 2;
const CHANGE_UNANSWERED_MINUTES = 30;
const CHANGE_UNANSWERED_SOON_MINUTES = 10;
const LIVE = "('confirmed','on_the_way','arrived')";

type OfferRow = {
  id: string; booking_reference: string; leg: "outbound" | "return"; mode: OfferMode; fee_pence: number | null;
  trip_date: string; trip_time: string; pickup: string; dropoff: string; passengers: number; suitcases: number;
  vehicle: string; flight_number: string; owner_note: string; status: string; awarded_driver_id: string | null;
  awarded_fee_pence: number | null; expires_at: string; created_at: string; closed_at: string | null;
};
type RecipientRow = { offer_id: string; driver_id: string; state: string; bid_pence: number | null; bid_note: string; seen_at: string | null; responded_at: string | null };
type JobRow = {
  id: string; offer_id: string; booking_reference: string; leg: "outbound" | "return"; driver_id: string; fee_pence: number;
  trip_date: string; trip_time: string; pickup: string; dropoff: string; status: string;
  on_the_way_at: string | null; arrived_at: string | null; completed_at: string | null;
  arrived_lat: number | null; arrived_lng: number | null; arrived_accuracy_m: number | null;
  completed_lat: number | null; completed_lng: number | null; completed_accuracy_m: number | null;
  released_at: string | null; release_reason: string; customer_notified_at: string | null; created_at: string;
};
type ChangeRow = { id: string; job_id: string; old_values: string; new_values: string; status: string; created_at: string; responded_at: string | null };
type EscalationRow = {
  id: string; source_type: string; source_id: string; driver_id: string | null; priority: string; title: string; body: string;
  created_at: string; level: number; last_notified_at: string | null; next_notify_at: string | null; acknowledged_at: string | null; closed_at: string | null;
};

type Ctx = { db: D1Like; cors: HeadersInit; now: () => Date; deps: DriverJobsDeps };

// ---------- small helpers ----------

export function feeLabel(pence: number | null | undefined): string {
  if (pence == null) return "";
  return `£${(pence / 100).toFixed(2)}`;
}

function feeFromBody(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isInteger(n) || n < MIN_FEE_PENCE || n > MAX_FEE_PENCE) {
    throw new HttpError(400, `Enter a driver fee between ${feeLabel(MIN_FEE_PENCE)} and ${feeLabel(MAX_FEE_PENCE)}.`);
  }
  return n;
}

/** UTC time of a Europe/London wall-clock date and time. */
export function londonToUtcMs(dateYmd: string, hm: string): number {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const [h, mi] = (/^\d{1,2}:\d{2}/.test(hm) ? hm : "00:00").split(":").map(Number);
  const guess = Date.UTC(y, (m || 1) - 1, d || 1, h || 0, mi || 0);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return guess - (shown - guess);
}

export function londonYmd(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * A pickup or drop-off shown before a driver has the job: the area only.
 * Drops the house/street part and the inward half of a postcode.
 */
export function areaLabel(label: string): string {
  const parts = label.split(",").map((p) => p.trim()).filter(Boolean);
  const kept = parts.length >= 3 ? parts.slice(1) : parts.length === 2 && /^\d/.test(parts[0]) ? parts.slice(1) : parts;
  return kept
    .join(", ")
    .replace(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}\b/gi, (_, outward: string) => outward.toUpperCase())
    .replace(/^\d+[a-z]?\s+/i, "");
}

/** "2026-11-14", "06:30" → "14 Nov 2026 at 06:30" for emails and alerts. */
export function whenLabel(dateYmd: string, hm: string): string {
  const [y, m, d] = dateYmd.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const date = y && m && d ? `${Number(d)} ${months[Number(m) - 1] ?? m} ${y}` : dateYmd;
  return hm ? `${date} at ${hm}` : date;
}

function legOf(booking: DispatchBooking, leg: "outbound" | "return"): DispatchLeg | null {
  return leg === "outbound" ? booking.outbound : booking.return;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

function legValues(l: { tripDate?: string; tripTime?: string; pickup?: string; dropoff?: string; trip_date?: string; trip_time?: string }) {
  return {
    tripDate: (l.tripDate ?? l.trip_date ?? "").trim(),
    tripTime: (l.tripTime ?? l.trip_time ?? "").trim(),
    pickup: (l.pickup ?? "").trim(),
    dropoff: (l.dropoff ?? "").trim(),
  };
}

function sameValues(a: ReturnType<typeof legValues>, b: ReturnType<typeof legValues>): boolean {
  return a.tripDate === b.tripDate && a.tripTime === b.tripTime && a.pickup === b.pickup && a.dropoff === b.dropoff;
}

function parse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function safely(label: string, run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run();
    return true;
  } catch (error) {
    console.error(`driver-jobs ${label} failed`, error instanceof Error ? error.message : error);
    return false;
  }
}

async function rows<T>(statement: D1PreparedLike): Promise<T[]> {
  return (await statement.all<T>()).results ?? [];
}

// ---------- owner alerts that repeat until acknowledged ----------

async function raiseEscalation(
  ctx: Ctx,
  input: { sourceType: "message" | "change" | "offer" | "job"; sourceId: string; driverId: string | null; priority: "high" | "normal"; title: string; body: string },
): Promise<string> {
  const now = ctx.now();
  const at = now.toISOString();
  const id = newId("esc");
  const next = input.priority === "high" ? new Date(now.getTime() + ESCALATION_STEPS_MINUTES[0] * 60_000).toISOString() : null;
  await ctx.db.batch([
    ctx.db
      .prepare(
        "INSERT INTO escalations (id, source_type, source_id, driver_id, priority, title, body, created_at, level, last_notified_at, next_notify_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
      )
      .bind(id, input.sourceType, input.sourceId, input.driverId, input.priority, input.title, input.body, at, at, next),
    auditStatement(ctx.db, at, "system", "", "owner_alert.raised", input.driverId, {
      escalationId: id, sourceType: input.sourceType, sourceId: input.sourceId, priority: input.priority, title: input.title,
    }),
  ]);
  await safely("owner notice", async () =>
    ctx.deps.notifyOwner?.({ title: input.title, body: input.body, url: "/owner/?ui=mobile#drivers", tag: id, priority: input.priority }),
  );
  return id;
}

/** Used by the Stage 1 Contact Office route: an urgent driver report alerts the owner at once. */
export async function raiseUrgentReportEscalation(
  env: DriverAccountsEnv,
  deps: DriverJobsDeps,
  report: { messageId: string; driverId: string; driverName: string; categoryLabel: string; body: string },
): Promise<void> {
  if (!env.DRIVER_DB) return;
  const ctx: Ctx = { db: env.DRIVER_DB, cors: {}, now: deps.now ?? (() => new Date()), deps };
  await raiseEscalation(ctx, {
    sourceType: "message",
    sourceId: report.messageId,
    driverId: report.driverId,
    priority: "high",
    title: `${report.categoryLabel}: ${report.driverName}`,
    body: report.body.slice(0, 160),
  });
}

async function closeEscalations(ctx: Ctx, sourceType: string, sourceId: string, note: string): Promise<void> {
  await ctx.db
    .prepare("UPDATE escalations SET closed_at = ?, close_note = ? WHERE source_type = ? AND source_id = ? AND closed_at IS NULL")
    .bind(ctx.now().toISOString(), note, sourceType, sourceId)
    .run();
}

/**
 * Housekeeping that runs on a timer when live, and before every dispatch screen loads:
 * expires offers nobody took, flags changes a driver has not answered, and repeats
 * high-priority alerts the owner has not acknowledged.
 */
export async function runDriverJobsMaintenance(
  env: DriverAccountsEnv,
  deps: DriverJobsDeps,
): Promise<{ expiredOffers: number; reminders: number; unansweredChanges: number }> {
  if (!env.DRIVER_DB) return { expiredOffers: 0, reminders: 0, unansweredChanges: 0 };
  return maintenance({ db: env.DRIVER_DB, cors: {}, now: deps.now ?? (() => new Date()), deps });
}

async function maintenance(ctx: Ctx): Promise<{ expiredOffers: number; reminders: number; unansweredChanges: number }> {
  const { db } = ctx;
  const now = ctx.now();
  const at = now.toISOString();

  // 1. Offers past their deadline.
  const stale = await rows<OfferRow>(db.prepare("SELECT * FROM job_offers WHERE status = 'open' AND expires_at <= ?").bind(at));
  for (const offer of stale) {
    await db.batch([
      db.prepare("UPDATE job_offers SET status = 'expired', closed_at = ? WHERE id = ? AND status = 'open'").bind(at, offer.id),
      auditStatement(db, at, "system", "", "offer.expired", null, { offerId: offer.id, reference: offer.booking_reference, leg: offer.leg }),
    ]);
    const bids = await db.prepare("SELECT COUNT(*) AS n FROM job_offer_recipients WHERE offer_id = ? AND state = 'bid'").bind(offer.id).first<{ n: number }>();
    const soon = londonToUtcMs(offer.trip_date, offer.trip_time) - now.getTime() < 48 * 3_600_000;
    await raiseEscalation(ctx, {
      sourceType: "offer",
      sourceId: offer.id,
      driverId: null,
      priority: soon ? "high" : "normal",
      title: `No driver yet for ${offer.booking_reference}`,
      body: Number(bids?.n ?? 0)
        ? `The offer closed with ${bids?.n} bid(s) and no driver chosen. Pickup ${whenLabel(offer.trip_date, offer.trip_time)}.`
        : `The offer closed and nobody took it. Pickup ${whenLabel(offer.trip_date, offer.trip_time)}.`,
    });
  }

  // 2. Changes the driver has not answered.
  const pending = await rows<ChangeRow & { trip_date: string; trip_time: string; booking_reference: string; driver_id: string; driver_name: string }>(
    db.prepare(
      `SELECT c.*, j.trip_date, j.trip_time, j.booking_reference, j.driver_id, d.name AS driver_name
       FROM job_change_requests c JOIN driver_jobs j ON j.id = c.job_id JOIN drivers d ON d.id = j.driver_id
       WHERE c.status = 'pending' AND j.status IN ${LIVE}
         AND NOT EXISTS (SELECT 1 FROM escalations e WHERE e.source_type = 'change' AND e.source_id = c.id)`,
    ),
  );
  let unansweredChanges = 0;
  for (const change of pending) {
    const next = parse<{ tripDate?: string; tripTime?: string }>(change.new_values, {});
    const pickupMs = Math.min(londonToUtcMs(change.trip_date, change.trip_time), londonToUtcMs(next.tripDate || change.trip_date, next.tripTime || change.trip_time));
    const limit = pickupMs - now.getTime() < 24 * 3_600_000 ? CHANGE_UNANSWERED_SOON_MINUTES : CHANGE_UNANSWERED_MINUTES;
    if (now.getTime() - Date.parse(change.created_at) < limit * 60_000) continue;
    unansweredChanges++;
    await raiseEscalation(ctx, {
      sourceType: "change",
      sourceId: change.id,
      driverId: change.driver_id,
      priority: "high",
      title: `${firstName(change.driver_name)} hasn't answered the change to ${change.booking_reference}`,
      body: "The driver is still assigned on the old details until they answer or you choose another driver.",
    });
  }

  // 3. Repeat unacknowledged high-priority alerts.
  const due = await rows<EscalationRow>(
    db.prepare("SELECT * FROM escalations WHERE closed_at IS NULL AND acknowledged_at IS NULL AND next_notify_at IS NOT NULL AND next_notify_at <= ?").bind(at),
  );
  for (const esc of due) {
    const level = esc.level + 1;
    const step = ESCALATION_STEPS_MINUTES[level];
    const next = step ? new Date(now.getTime() + step * 60_000).toISOString() : null;
    await db.batch([
      db.prepare("UPDATE escalations SET level = ?, last_notified_at = ?, next_notify_at = ? WHERE id = ? AND level = ?").bind(level, at, next, esc.id, esc.level),
      auditStatement(db, at, "system", "", "owner_alert.reminder", esc.driver_id, { escalationId: esc.id, level, emailed: level >= ESCALATION_EMAIL_FROM_LEVEL }),
    ]);
    await safely("owner reminder", async () =>
      ctx.deps.notifyOwner?.({ title: `Reminder ${level}: ${esc.title}`, body: esc.body, url: "/owner/?ui=mobile#drivers", tag: `${esc.id}-${level}`, priority: "high" }),
    );
    if (level >= ESCALATION_EMAIL_FROM_LEVEL) {
      await safely("owner reminder email", async () =>
        ctx.deps.emailOwner?.(
          `Not yet acknowledged: ${esc.title}`,
          `${esc.title}\n\n${esc.body}\n\nRaised ${esc.created_at}. Open the Owner Dashboard → Drivers to acknowledge it.\nNothing has been changed on any booking.`,
        ),
      );
    }
  }
  return { expiredOffers: stale.length, reminders: due.length, unansweredChanges };
}

// ---------- keeping a job in step with its booking ----------

/**
 * Compares a live job with its booking. A material change becomes a request the driver must
 * answer; a cancelled booking closes the job. The driver is never removed here.
 */
async function syncJob(ctx: Ctx, job: JobRow, booking: DispatchBooking | null): Promise<void> {
  if (!booking || !["confirmed", "on_the_way", "arrived"].includes(job.status)) return;
  const { db } = ctx;
  const at = ctx.now().toISOString();
  const leg = legOf(booking, job.leg);
  const driver = await getDriver(db, job.driver_id);

  if (booking.status === "cancelled" || !leg) {
    await db.batch([
      db.prepare(`UPDATE driver_jobs SET status = 'booking_cancelled' WHERE id = ? AND status IN ${LIVE}`).bind(job.id),
      db.prepare("UPDATE job_change_requests SET status = 'superseded', responded_at = ? WHERE job_id = ? AND status = 'pending'").bind(at, job.id),
      auditStatement(db, at, "system", "", "job.booking_cancelled", job.driver_id, { jobId: job.id, reference: job.booking_reference, leg: job.leg }),
    ]);
    if (driver) {
      await safely("driver email", async () =>
        ctx.deps.emailDriver?.(driver, `Job cancelled — ${whenLabel(job.trip_date, job.trip_time)}`, `Hi ${firstName(driver.name)},\n\nThe customer booking for ${whenLabel(job.trip_date, job.trip_time)} has been cancelled, so this job is off. Open your driver portal for details.`),
      );
    }
    return;
  }

  const current = legValues(job);
  const wanted = legValues(leg);
  const latest = await db
    // rowid = insertion order, so two changes in the same millisecond still sort correctly.
    .prepare("SELECT * FROM job_change_requests WHERE job_id = ? ORDER BY rowid DESC LIMIT 1")
    .bind(job.id)
    .first<ChangeRow>();
  const latestWanted = latest ? parse(latest.new_values, current) : null;

  if (sameValues(current, wanted)) {
    // Booking matches the job again (e.g. the change was undone): drop any unanswered request.
    if (latest?.status === "pending") {
      await db.batch([
        db.prepare("UPDATE job_change_requests SET status = 'superseded', responded_at = ? WHERE id = ? AND status = 'pending'").bind(at, latest.id),
        auditStatement(db, at, "system", "", "job.change_withdrawn", job.driver_id, { jobId: job.id, changeId: latest.id }),
      ]);
      await closeEscalations(ctx, "change", latest.id, "Booking went back to the original details");
    }
    return;
  }
  // Already asked (pending) or already refused (can't do) for exactly these details.
  if (latest && latestWanted && sameValues(legValues(latestWanted), wanted) && (latest.status === "pending" || latest.status === "cant_do")) return;

  const changeId = newId("chg");
  const statements = [
    db
      .prepare("INSERT INTO job_change_requests (id, job_id, old_values, new_values, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)")
      .bind(changeId, job.id, JSON.stringify(current), JSON.stringify(wanted), at),
    auditStatement(db, at, "system", "", "job.change_requested", job.driver_id, { jobId: job.id, changeId, reference: job.booking_reference, from: current, to: wanted }),
  ];
  if (latest?.status === "pending") {
    statements.unshift(db.prepare("UPDATE job_change_requests SET status = 'superseded', responded_at = ? WHERE id = ? AND status = 'pending'").bind(at, latest.id));
  }
  await db.batch(statements);
  if (latest?.status === "pending") await closeEscalations(ctx, "change", latest.id, "Replaced by a newer change");
  if (driver) {
    await safely("driver email", async () =>
      ctx.deps.emailDriver?.(
        driver,
        `Change to your job on ${whenLabel(current.tripDate, "")} — please answer`,
        `Hi ${firstName(driver.name)},\n\nA job you have accepted has changed.\n\nWas: ${whenLabel(current.tripDate, current.tripTime)}, ${areaLabel(current.pickup)}\nNow: ${whenLabel(wanted.tripDate, wanted.tripTime)}, ${areaLabel(wanted.pickup)}\n\nPlease open your driver portal and choose Accept Change or Can't Do New Time.`,
      ),
    );
  }
}

async function syncLiveJobs(ctx: Ctx, driverId?: string): Promise<void> {
  const live = await rows<JobRow>(
    driverId
      ? ctx.db.prepare(`SELECT * FROM driver_jobs WHERE driver_id = ? AND status IN ${LIVE}`).bind(driverId)
      : ctx.db.prepare(`SELECT * FROM driver_jobs WHERE status IN ${LIVE}`),
  );
  for (const job of live) {
    await safely("job sync", async () => syncJob(ctx, job, await ctx.deps.getBooking(job.booking_reference)));
  }
}

// ---------- confirming a job ----------

async function eligibility(ctx: Ctx, driver: DriverRow): Promise<{ documentsOk: boolean; canReceiveOffers: boolean }> {
  const docs = await getDocuments(ctx.db, driver.id);
  const today = ymd(ctx.now());
  return { documentsOk: missingForApproval(docs, today).length === 0, canReceiveOffers: canReceiveOffers(driver, docs, today) };
}

/**
 * Turns an open offer into a confirmed job for one driver, once only.
 * The conditional UPDATE plus the unique "one live job per leg" index make a double award impossible.
 */
async function confirmJob(ctx: Ctx, offer: OfferRow, driver: DriverRow, feePence: number, actor: "owner" | "driver"): Promise<JobRow> {
  const { db } = ctx;
  const at = ctx.now().toISOString();
  if (driver.status !== "approved") throw new HttpError(409, `${firstName(driver.name)} is not an approved driver.`);
  if (!(await eligibility(ctx, driver)).documentsOk) throw new HttpError(409, `${firstName(driver.name)}'s documents are not all accepted and in date.`);
  if (!driver.vehicle_reg.trim()) {
    throw new HttpError(409, actor === "driver" ? "Add your vehicle registration first. The customer is sent part of it." : `${firstName(driver.name)} has not added a vehicle registration yet.`);
  }
  const booking = await ctx.deps.getBooking(offer.booking_reference);
  if (!booking || booking.status !== "paid" || !legOf(booking, offer.leg)) throw new HttpError(409, "This booking is no longer open for a driver.");

  const jobId = newId("job");
  await db.batch([
    db
      .prepare("UPDATE job_offers SET status = 'assigned', awarded_driver_id = ?, awarded_fee_pence = ?, closed_at = ? WHERE id = ? AND status = 'open' AND expires_at > ?")
      .bind(driver.id, feePence, at, offer.id, at),
    db
      .prepare(
        `INSERT INTO driver_jobs (id, offer_id, booking_reference, leg, driver_id, fee_pence, trip_date, trip_time, pickup, dropoff, status, created_at)
         SELECT ?, o.id, o.booking_reference, o.leg, ?, ?, o.trip_date, o.trip_time, o.pickup, o.dropoff, 'confirmed', ?
         FROM job_offers o
         WHERE o.id = ? AND o.status = 'assigned' AND o.awarded_driver_id = ? AND o.closed_at = ?
           AND NOT EXISTS (SELECT 1 FROM driver_jobs j WHERE j.offer_id = o.id)`,
      )
      .bind(jobId, driver.id, feePence, at, offer.id, driver.id, at),
  ]);
  const job = await db.prepare("SELECT * FROM driver_jobs WHERE id = ?").bind(jobId).first<JobRow>();
  if (!job) throw new HttpError(409, actor === "driver" ? "Sorry — this job has just gone to another driver or is no longer open." : "This offer is no longer open.");

  await db.batch([
    db.prepare("UPDATE job_offer_recipients SET state = 'accepted', responded_at = COALESCE(responded_at, ?) WHERE offer_id = ? AND driver_id = ?").bind(at, offer.id, driver.id),
    auditStatement(db, at, actor, actor === "driver" ? driver.id : "owner", "job.confirmed", driver.id, {
      jobId, offerId: offer.id, reference: offer.booking_reference, leg: offer.leg, mode: offer.mode, feePence,
      chosenBy: offer.mode === "bids" ? "owner" : actor,
    }),
  ]);
  await closeEscalations(ctx, "offer", offer.id, "A driver has the job");

  const assigned: AssignedDriver = {
    id: driver.id, firstName: firstName(driver.name), email: driver.email, mobile: driver.mobile,
    vehicleReg: driver.vehicle_reg, vehicle: driver.vehicle_summary, feePence,
  };
  await safely("record assignment", async () => ctx.deps.recordAssignment?.(offer.booking_reference, offer.leg, assigned));
  let customer: { sent: boolean; reason?: string } = { sent: false, reason: "not_configured" };
  await safely("customer driver details", async () => {
    if (ctx.deps.sendCustomerDriverDetails) customer = await ctx.deps.sendCustomerDriverDetails(offer.booking_reference, offer.leg, assigned);
  });
  await db.batch([
    ...(customer.sent ? [db.prepare("UPDATE driver_jobs SET customer_notified_at = ? WHERE id = ?").bind(at, jobId)] : []),
    auditStatement(db, at, "system", "", "job.customer_driver_details", driver.id, { jobId, sent: customer.sent, reason: customer.reason ?? "" }),
  ]);
  if (actor === "driver") {
    await safely("owner notice", async () =>
      ctx.deps.notifyOwner?.({
        title: `${assigned.firstName} accepted ${offer.booking_reference}`,
        body: `${whenLabel(offer.trip_date, offer.trip_time)} · driver fee ${feeLabel(feePence)}`,
        url: "/owner/?ui=mobile#drivers", tag: jobId, priority: "normal",
      }),
    );
  } else {
    await safely("driver email", async () =>
      ctx.deps.emailDriver?.(driver, `You have the job on ${whenLabel(offer.trip_date, offer.trip_time)}`, `Hi ${assigned.firstName},\n\nYou have been given the job on ${whenLabel(offer.trip_date, offer.trip_time)}. Your fee: ${feeLabel(feePence)}.\n\nFull details are in your driver portal.`),
    );
  }
  return job;
}

// ---------- views ----------

function offerViewForDriver(offer: OfferRow, mine: RecipientRow) {
  return {
    id: offer.id,
    mode: offer.mode,
    // The fee offered to this driver. Never the customer fare.
    feePence: offer.mode === "bids" ? null : offer.fee_pence,
    feeLabel: offer.mode === "bids" ? "" : feeLabel(offer.fee_pence),
    tripDate: offer.trip_date,
    tripTime: offer.trip_time,
    leg: offer.leg,
    pickupArea: areaLabel(offer.pickup),
    dropoffArea: areaLabel(offer.dropoff),
    passengers: offer.passengers,
    suitcases: offer.suitcases,
    vehicle: offer.vehicle,
    hasFlight: Boolean(offer.flight_number),
    note: offer.owner_note,
    expiresAt: offer.expires_at,
    myState: mine.state,
    myBidPence: mine.bid_pence,
    myBidLabel: feeLabel(mine.bid_pence),
    myBidNote: mine.bid_note,
  };
}

function changeView(change: ChangeRow | undefined) {
  if (!change) return null;
  return { id: change.id, status: change.status, from: parse(change.old_values, {}), to: parse(change.new_values, {}), createdAt: change.created_at, respondedAt: change.responded_at };
}

function locationView(lat: number | null, lng: number | null, accuracy: number | null, at: string | null) {
  if (!at) return null;
  return lat == null || lng == null
    ? { verified: false, at, note: "Location was not verified (the phone did not share it)." }
    : { verified: true, at, lat, lng, accuracyMetres: accuracy };
}

// ---------- routing ----------

export function isDriverJobsPath(pathname: string): boolean {
  return pathname.startsWith("/owner/driver-jobs") || pathname.startsWith("/driver-portal/jobs");
}

/** Returns a Response for Stage 2 routes, or null if the path is not one of them. */
export async function handleDriverJobsRequest(request: Request, env: DriverAccountsEnv, deps: DriverJobsDeps): Promise<Response | null> {
  const url = new URL(request.url);
  if (!isDriverJobsPath(url.pathname)) return null;
  const cors = corsWithSessionHeader(deps.corsHeaders(request.headers.get("Origin")));
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const db = env.DRIVER_DB;
  if (!db) return json({ ok: false, error: "Not found." }, 404, cors);
  const ctx: Ctx = { db, cors, now: deps.now ?? (() => new Date()), deps };
  try {
    if (url.pathname.startsWith("/owner/driver-jobs")) {
      if (!deps.ownerAuthorized(request)) throw new HttpError(401, "Owner sign-in required.");
      return await ownerRoute(request, url, ctx);
    }
    return await driverRoute(request, url, ctx);
  } catch (error) {
    if (error instanceof HttpError) return json({ ok: false, error: error.message, ...error.extra }, error.status, cors);
    console.error("driver-jobs error", error instanceof Error ? error.message : error);
    return json({ ok: false, error: "Something went wrong." }, 500, cors);
  }
}

// ---------- owner routes ----------

async function openEscalations(db: D1Like) {
  const list = await rows<EscalationRow & { driver_name: string | null }>(
    db.prepare(
      "SELECT e.*, d.name AS driver_name FROM escalations e LEFT JOIN drivers d ON d.id = e.driver_id WHERE e.closed_at IS NULL ORDER BY CASE WHEN e.acknowledged_at IS NULL THEN 0 ELSE 1 END, CASE e.priority WHEN 'high' THEN 0 ELSE 1 END, e.created_at DESC LIMIT 50",
    ),
  );
  return list.map((e) => ({
    id: e.id, sourceType: e.source_type, sourceId: e.source_id, driverId: e.driver_id, driverName: e.driver_name ?? "",
    priority: e.priority, title: e.title, body: e.body, createdAt: e.created_at, reminders: e.level,
    acknowledgedAt: e.acknowledged_at, nextReminderAt: e.acknowledged_at ? null : e.next_notify_at,
  }));
}

async function ownerJobView(ctx: Ctx, job: JobRow & { driver_name: string; driver_status: string; driver_mobile: string }, changes: ChangeRow[]) {
  // `changes` arrives oldest first (rowid order); the last one for this job is the latest.
  const latest = changes.filter((c) => c.job_id === job.id).pop();
  return {
    id: job.id, reference: job.booking_reference, leg: job.leg, driverId: job.driver_id, driverName: job.driver_name,
    driverStatus: job.driver_status, driverMobile: job.driver_mobile,
    feePence: job.fee_pence, feeLabel: feeLabel(job.fee_pence), tripDate: job.trip_date, tripTime: job.trip_time,
    pickup: job.pickup, dropoff: job.dropoff, status: job.status,
    onTheWayAt: job.on_the_way_at, arrivedAt: job.arrived_at, completedAt: job.completed_at,
    arrivedLocation: locationView(job.arrived_lat, job.arrived_lng, job.arrived_accuracy_m, job.arrived_at),
    completedLocation: locationView(job.completed_lat, job.completed_lng, job.completed_accuracy_m, job.completed_at),
    releasedAt: job.released_at, releaseReason: job.release_reason,
    customerToldAt: job.customer_notified_at,
    change: latest && (latest.status === "pending" || latest.status === "cant_do") ? changeView(latest) : null,
    // Payments are a later stage: a completed job waits for the owner's approval there.
    payment: job.status === "completed" ? "Awaiting your approval (payments not switched on)" : "",
  };
}

async function ownerRoute(request: Request, url: URL, ctx: Ctx): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, "");
  const { db, cors } = ctx;
  const now = ctx.now();
  const at = now.toISOString();
  const today = londonYmd(now);

  if (path === "/owner/driver-jobs/summary" && request.method === "GET") {
    await safely("maintenance", () => maintenance(ctx));
    const escalations = await openEscalations(db);
    const counts = await db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM job_offers WHERE status = 'open') AS offers,
                (SELECT COUNT(*) FROM job_offer_recipients r JOIN job_offers o ON o.id = r.offer_id WHERE o.status = 'open' AND r.state = 'bid') AS bids,
                (SELECT COUNT(*) FROM driver_jobs WHERE status IN ${LIVE}) AS jobs`,
      )
      .first<{ offers: number; bids: number; jobs: number }>();
    return json(
      { ok: true, escalations, unacknowledged: escalations.filter((e) => !e.acknowledgedAt).length, openOffers: Number(counts?.offers ?? 0), bids: Number(counts?.bids ?? 0), liveJobs: Number(counts?.jobs ?? 0) },
      200, cors,
    );
  }

  if (path === "/owner/driver-jobs" && request.method === "GET") {
    await safely("maintenance", () => maintenance(ctx));
    await syncLiveJobs(ctx);
    const offers = await rows<OfferRow>(db.prepare("SELECT * FROM job_offers WHERE status = 'open' ORDER BY trip_date, trip_time"));
    const closedOffers = await rows<OfferRow>(db.prepare("SELECT * FROM job_offers WHERE status IN ('expired','declined') AND trip_date >= ? ORDER BY closed_at DESC LIMIT 20").bind(today));
    const recipients = await rows<RecipientRow & { driver_name: string; driver_status: string; available: number }>(
      db.prepare(
        "SELECT r.*, d.name AS driver_name, d.status AS driver_status, d.available FROM job_offer_recipients r JOIN drivers d ON d.id = r.driver_id JOIN job_offers o ON o.id = r.offer_id WHERE o.status IN ('open','expired','declined')",
      ),
    );
    const jobs = await rows<JobRow & { driver_name: string; driver_status: string; driver_mobile: string }>(
      db.prepare(
        `SELECT j.*, d.name AS driver_name, d.status AS driver_status, d.mobile AS driver_mobile FROM driver_jobs j JOIN drivers d ON d.id = j.driver_id
         WHERE j.status IN ${LIVE} OR j.trip_date >= ? ORDER BY j.trip_date, j.trip_time`,
      ).bind(ymd(new Date(now.getTime() - 14 * 86_400_000))),
    );
    const changes = await rows<ChangeRow>(db.prepare("SELECT c.* FROM job_change_requests c JOIN driver_jobs j ON j.id = c.job_id WHERE c.status IN ('pending','cant_do') ORDER BY c.rowid"));
    const offerView = (o: OfferRow) => ({
      id: o.id, reference: o.booking_reference, leg: o.leg, mode: o.mode, feePence: o.fee_pence, feeLabel: feeLabel(o.fee_pence),
      tripDate: o.trip_date, tripTime: o.trip_time, pickup: o.pickup, dropoff: o.dropoff, note: o.owner_note,
      status: o.status, expiresAt: o.expires_at, createdAt: o.created_at, closedAt: o.closed_at,
      recipients: recipients
        .filter((r) => r.offer_id === o.id)
        .map((r) => ({
          driverId: r.driver_id, driverName: r.driver_name, driverStatus: r.driver_status, state: r.state,
          bidPence: r.bid_pence, bidLabel: feeLabel(r.bid_pence), bidNote: r.bid_note, seenAt: r.seen_at, respondedAt: r.responded_at,
          // A bid from a driver who is no longer approved cannot be chosen.
          canBeChosen: r.state === "bid" && r.driver_status === "approved",
        }))
        .sort((a, b) => (a.bidPence ?? 1e9) - (b.bidPence ?? 1e9) || a.driverName.localeCompare(b.driverName)),
    });

    // Paid bookings in the next 60 days with a leg that has no driver job and no open offer.
    const taken = new Set([...jobs.filter((j) => ["confirmed", "on_the_way", "arrived", "completed"].includes(j.status)).map((j) => `${j.booking_reference}:${j.leg}`), ...offers.map((o) => `${o.booking_reference}:${o.leg}`)]);
    const horizon = ymd(new Date(now.getTime() + 60 * 86_400_000));
    const needsDriver: Array<Record<string, unknown>> = [];
    let bookingLookupFailed = false;
    try {
      for (const booking of await ctx.deps.listUpcomingBookings(today)) {
        if (booking.status !== "paid") continue;
        for (const leg of ["outbound", "return"] as const) {
          const info = legOf(booking, leg);
          if (!info || info.tripDate < today || info.tripDate > horizon || taken.has(`${booking.reference}:${leg}`)) continue;
          needsDriver.push({
            reference: booking.reference, leg, tripDate: info.tripDate, tripTime: info.tripTime, pickup: info.pickup, dropoff: info.dropoff,
            passengers: booking.passengers, vehicle: booking.vehicle, customerFirstName: booking.customerFirstName,
            assignedOutsidePortal: booking.assignedOutsidePortal,
          });
        }
      }
    } catch (error) {
      bookingLookupFailed = true;
      console.error("driver-jobs booking list failed", error instanceof Error ? error.message : error);
    }
    needsDriver.sort((a, b) => `${a.tripDate}T${a.tripTime}`.localeCompare(`${b.tripDate}T${b.tripTime}`));

    const drivers = await rows<DriverRow>(db.prepare("SELECT * FROM drivers WHERE status = 'approved' ORDER BY name"));
    const driverViews = [];
    for (const d of drivers) {
      const e = await eligibility(ctx, d);
      driverViews.push({ id: d.id, name: d.name, available: d.available === 1, documentsOk: e.documentsOk, canReceiveOffers: e.canReceiveOffers, hasVehicleReg: Boolean(d.vehicle_reg.trim()) });
    }
    const views = [];
    for (const j of jobs) views.push(await ownerJobView(ctx, j, changes));
    return json(
      {
        ok: true, today, bookingLookupFailed, needsDriver,
        offers: offers.map(offerView), closedOffers: closedOffers.map(offerView),
        jobs: views.filter((j) => ["confirmed", "on_the_way", "arrived"].includes(j.status)),
        recent: views.filter((j) => !["confirmed", "on_the_way", "arrived"].includes(j.status)).reverse().slice(0, 30),
        drivers: driverViews, escalations: await openEscalations(db),
      },
      200, cors,
    );
  }

  if (path === "/owner/driver-jobs/offers" && request.method === "POST") {
    const body = await readJson(request);
    const reference = text(body.reference, 64);
    const leg = text(body.leg, 10) === "return" ? "return" : "outbound";
    const mode = text(body.mode, 10) as OfferMode;
    if (!OFFER_MODES.includes(mode)) throw new HttpError(400, "Choose how to offer this job.");
    const feePence = mode === "bids" ? null : feeFromBody(body.feePence);
    const driverIds = Array.isArray(body.driverIds) ? [...new Set(body.driverIds.map((v) => text(v, 64)).filter(Boolean))] : [];
    if (!driverIds.length) throw new HttpError(400, "Choose at least one driver.");
    if (mode === "direct" && driverIds.length !== 1) throw new HttpError(400, "Direct assignment is for one driver.");
    if (driverIds.length > 30) throw new HttpError(400, "Too many drivers for one offer.");
    const minutes = body.expiresInMinutes == null ? DEFAULT_OFFER_MINUTES : Number(body.expiresInMinutes);
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > MAX_OFFER_MINUTES) throw new HttpError(400, "Choose how long the offer stays open.");

    const booking = await ctx.deps.getBooking(reference);
    if (!booking) throw new HttpError(404, "Booking not found.");
    if (booking.status !== "paid") throw new HttpError(409, booking.status === "cancelled" ? "This booking is cancelled." : "This booking is not paid yet.");
    const info = legOf(booking, leg);
    if (!info || !info.tripDate) throw new HttpError(409, "This booking has no such journey.");
    const pickupMs = londonToUtcMs(info.tripDate, info.tripTime);
    if (pickupMs <= now.getTime()) throw new HttpError(409, "This journey's pickup time has passed.");
    const live = await db.prepare(`SELECT j.id, d.name FROM driver_jobs j JOIN drivers d ON d.id = j.driver_id WHERE j.booking_reference = ? AND j.leg = ? AND j.status IN ${LIVE}`).bind(booking.reference, leg).first<{ id: string; name: string }>();
    if (live) throw new HttpError(409, `${firstName(live.name)} already has this job. Release them first if you want another driver.`);
    const open = await db.prepare("SELECT id FROM job_offers WHERE booking_reference = ? AND leg = ? AND status = 'open'").bind(booking.reference, leg).first<{ id: string }>();
    if (open) throw new HttpError(409, "There is already an open offer for this journey. Withdraw it first.");

    const refused: Array<{ driverId: string; name: string; reason: string }> = [];
    const chosen: DriverRow[] = [];
    for (const id of driverIds) {
      const d = await getDriver(db, id);
      if (!d) { refused.push({ driverId: id, name: "", reason: "Not found" }); continue; }
      const e = await eligibility(ctx, d);
      // Offers only go to approved, available drivers with in-date documents. A direct
      // assignment may go to an approved driver who has switched to "unavailable".
      const ok = mode === "direct" ? d.status === "approved" && e.documentsOk : e.canReceiveOffers;
      if (ok) chosen.push(d);
      else refused.push({ driverId: d.id, name: d.name, reason: d.status !== "approved" ? `Account is ${d.status}` : !e.documentsOk ? "Documents not all accepted and in date" : "Switched to unavailable" });
    }
    if (!chosen.length) throw new HttpError(409, "None of those drivers can be offered work right now.", { refused });

    const offerId = newId("off");
    // Never open past the pickup time.
    const expiresAt = new Date(Math.min(now.getTime() + minutes * 60_000, pickupMs)).toISOString();
    await db.batch([
      db
        .prepare(
          "INSERT INTO job_offers (id, booking_reference, leg, mode, fee_pence, trip_date, trip_time, pickup, dropoff, passengers, suitcases, vehicle, flight_number, owner_note, status, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)",
        )
        .bind(offerId, booking.reference, leg, mode, feePence, info.tripDate, info.tripTime, info.pickup, info.dropoff, booking.passengers, booking.suitcases, booking.vehicle, info.flightNumber, text(body.note, 300), expiresAt, at),
      ...chosen.map((d) => db.prepare("INSERT INTO job_offer_recipients (offer_id, driver_id, state) VALUES (?, ?, 'sent')").bind(offerId, d.id)),
      auditStatement(db, at, "owner", "owner", "offer.created", mode === "direct" ? chosen[0].id : null, {
        offerId, reference: booking.reference, leg, mode, feePence, drivers: chosen.map((d) => d.id), refused, expiresAt,
      }),
    ]);
    for (const d of chosen) {
      await safely("driver email", async () =>
        ctx.deps.emailDriver?.(
          d,
          mode === "direct" ? `Job for you on ${whenLabel(info.tripDate, info.tripTime)} — please accept` : `New job offer for ${whenLabel(info.tripDate, info.tripTime)}`,
          `Hi ${firstName(d.name)},\n\n${mode === "direct" ? "You have been asked to do this job" : mode === "bids" ? "A job is open for your price" : "A job is on offer"}:\n${whenLabel(info.tripDate, info.tripTime)}\n${areaLabel(info.pickup)} → ${areaLabel(info.dropoff)}\n${feePence != null ? `Your fee: ${feeLabel(feePence)}\n` : ""}\nOpen your driver portal to answer. The offer closes ${new Date(expiresAt).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`,
        ),
      );
    }
    return json({ ok: true, offerId, sentTo: chosen.map((d) => ({ driverId: d.id, name: d.name })), refused, expiresAt }, 201, cors);
  }

  if (path === "/owner/driver-jobs/offers/withdraw" && request.method === "POST") {
    const body = await readJson(request);
    const offer = await db.prepare("SELECT * FROM job_offers WHERE id = ?").bind(text(body.offerId, 64)).first<OfferRow>();
    if (!offer) throw new HttpError(404, "Offer not found.");
    if (offer.status !== "open") throw new HttpError(409, "This offer is already closed.");
    await db.batch([
      db.prepare("UPDATE job_offers SET status = 'withdrawn', closed_at = ? WHERE id = ? AND status = 'open'").bind(at, offer.id),
      auditStatement(db, at, "owner", "owner", "offer.withdrawn", null, { offerId: offer.id, reference: offer.booking_reference, leg: offer.leg }),
    ]);
    return json({ ok: true }, 200, cors);
  }

  // The owner chooses the winning bid. The lowest bid never wins by itself.
  if (path === "/owner/driver-jobs/offers/award" && request.method === "POST") {
    const body = await readJson(request);
    const offer = await db.prepare("SELECT * FROM job_offers WHERE id = ?").bind(text(body.offerId, 64)).first<OfferRow>();
    if (!offer) throw new HttpError(404, "Offer not found.");
    if (offer.mode !== "bids") throw new HttpError(409, "Only a bidding offer has a winner to choose.");
    if (offer.status !== "open") throw new HttpError(409, "This offer is closed. Offer the job again to choose a driver.");
    const driverId = text(body.driverId, 64);
    const bid = await db.prepare("SELECT * FROM job_offer_recipients WHERE offer_id = ? AND driver_id = ?").bind(offer.id, driverId).first<RecipientRow>();
    if (!bid || bid.state !== "bid" || bid.bid_pence == null) throw new HttpError(409, "That driver has not bid on this job.");
    const driver = await getDriver(db, driverId);
    if (!driver) throw new HttpError(404, "Driver not found.");
    const job = await confirmJob(ctx, offer, driver, bid.bid_pence, "owner");
    return json({ ok: true, jobId: job.id, feePence: job.fee_pence, feeLabel: feeLabel(job.fee_pence) }, 200, cors);
  }

  // Take a driver off a job. Only the owner can do this, always with a reason.
  if (path === "/owner/driver-jobs/jobs/release" && request.method === "POST") {
    const body = await readJson(request);
    const reason = text(body.reason, 300);
    if (reason.length < 5) throw new HttpError(400, "Give a reason. It is kept in the audit log.");
    const job = await db.prepare("SELECT * FROM driver_jobs WHERE id = ?").bind(text(body.jobId, 64)).first<JobRow>();
    if (!job) throw new HttpError(404, "Job not found.");
    if (!["confirmed", "on_the_way", "arrived"].includes(job.status)) throw new HttpError(409, "This job is already finished or closed.");
    await db.batch([
      db.prepare(`UPDATE driver_jobs SET status = 'released', released_at = ?, release_reason = ? WHERE id = ? AND status IN ${LIVE}`).bind(at, reason, job.id),
      db.prepare("UPDATE job_change_requests SET status = 'superseded', responded_at = ? WHERE job_id = ? AND status = 'pending'").bind(at, job.id),
      auditStatement(db, at, "owner", "owner", "job.released", job.driver_id, { jobId: job.id, reference: job.booking_reference, leg: job.leg, reason, previousStatus: job.status }),
    ]);
    const changes = await rows<{ id: string }>(db.prepare("SELECT id FROM job_change_requests WHERE job_id = ?").bind(job.id));
    for (const c of changes) await closeEscalations(ctx, "change", c.id, "Driver released from the job");
    await safely("record assignment", async () => ctx.deps.recordAssignment?.(job.booking_reference, job.leg, null));
    const driver = await getDriver(db, job.driver_id);
    if (driver) {
      await safely("driver email", async () =>
        ctx.deps.emailDriver?.(driver, `You are no longer on the job for ${whenLabel(job.trip_date, job.trip_time)}`, `Hi ${firstName(driver.name)},\n\nThe office has taken you off the job on ${whenLabel(job.trip_date, job.trip_time)}.\n\nIf you have questions, use Contact Office in your driver portal.`),
      );
    }
    // The customer is not told automatically, and the booking itself is unchanged.
    return json({ ok: true, customerTold: false, bookingChanged: false }, 200, cors);
  }

  if (path === "/owner/driver-jobs/escalations/ack" && request.method === "POST") {
    const body = await readJson(request);
    const esc = await db.prepare("SELECT * FROM escalations WHERE id = ?").bind(text(body.id, 64)).first<EscalationRow>();
    if (!esc) throw new HttpError(404, "Alert not found.");
    if (!esc.acknowledged_at) {
      await db.batch([
        db.prepare("UPDATE escalations SET acknowledged_at = ?, next_notify_at = NULL WHERE id = ? AND acknowledged_at IS NULL").bind(at, esc.id),
        auditStatement(db, at, "owner", "owner", "owner_alert.acknowledged", esc.driver_id, { escalationId: esc.id, afterReminders: esc.level }),
      ]);
    }
    // Acknowledging only stops the reminders. The job or message still needs dealing with.
    return json({ ok: true, stillOpen: !esc.closed_at }, 200, cors);
  }

  if (path === "/owner/driver-jobs/escalations/close" && request.method === "POST") {
    const body = await readJson(request);
    const note = text(body.note, 300);
    const esc = await db.prepare("SELECT * FROM escalations WHERE id = ?").bind(text(body.id, 64)).first<EscalationRow>();
    if (!esc) throw new HttpError(404, "Alert not found.");
    if (esc.closed_at) return json({ ok: true }, 200, cors);
    if (esc.source_type === "message") throw new HttpError(409, "Mark the driver's report as handled on the driver's page. That closes this alert.");
    if (esc.source_type === "change") {
      const change = await db.prepare("SELECT c.status, j.status AS job_status FROM job_change_requests c JOIN driver_jobs j ON j.id = c.job_id WHERE c.id = ?").bind(esc.source_id).first<{ status: string; job_status: string }>();
      if (change && (change.status === "pending" || change.status === "cant_do") && ["confirmed", "on_the_way", "arrived"].includes(change.job_status)) {
        throw new HttpError(409, "This change is still unresolved. Release the driver or put the booking back first.");
      }
    }
    if (note.length < 5) throw new HttpError(400, "Add a short note on what you did. It is kept in the audit log.");
    await db.batch([
      db.prepare("UPDATE escalations SET closed_at = ?, close_note = ?, acknowledged_at = COALESCE(acknowledged_at, ?), next_notify_at = NULL WHERE id = ? AND closed_at IS NULL").bind(at, note, at, esc.id),
      auditStatement(db, at, "owner", "owner", "owner_alert.closed", esc.driver_id, { escalationId: esc.id, note }),
    ]);
    return json({ ok: true }, 200, cors);
  }

  if (path === "/owner/driver-jobs/maintenance" && request.method === "POST") {
    const result = await maintenance(ctx);
    await syncLiveJobs(ctx);
    return json({ ok: true, ...result }, 200, cors);
  }

  throw new HttpError(404, "Not found.");
}

// ---------- driver routes ----------

async function driverRoute(request: Request, url: URL, ctx: Ctx): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, "");
  const { db, cors } = ctx;
  const now = ctx.now();
  const at = now.toISOString();
  const today = londonYmd(now);
  const accountsCtx: AccountsCtx = { db, cors, now: ctx.now, token: () => "" };
  const { driver } = await requireSession(request, accountsCtx);
  if (driver.status !== "approved") throw new HttpError(403, "Jobs open once your account is approved.");

  if (path === "/driver-portal/jobs" && request.method === "GET") {
    await safely("maintenance", () => maintenance(ctx));
    await syncLiveJobs(ctx, driver.id);
    const offers = await rows<OfferRow & RecipientRow>(
      db.prepare(
        "SELECT o.*, r.offer_id, r.driver_id, r.state, r.bid_pence, r.bid_note, r.seen_at, r.responded_at FROM job_offer_recipients r JOIN job_offers o ON o.id = r.offer_id WHERE r.driver_id = ? AND o.status = 'open' AND o.expires_at > ? AND r.state <> 'declined' ORDER BY o.trip_date, o.trip_time",
      ).bind(driver.id, at),
    );
    await db.prepare("UPDATE job_offer_recipients SET seen_at = ? WHERE driver_id = ? AND seen_at IS NULL AND offer_id IN (SELECT id FROM job_offers WHERE status = 'open')").bind(at, driver.id).run();
    const jobs = await rows<JobRow>(db.prepare("SELECT * FROM driver_jobs WHERE driver_id = ? ORDER BY trip_date DESC, trip_time DESC LIMIT 200").bind(driver.id));
    const changes = await rows<ChangeRow>(db.prepare("SELECT c.* FROM job_change_requests c JOIN driver_jobs j ON j.id = c.job_id WHERE j.driver_id = ? AND c.status = 'pending'").bind(driver.id));
    const upcoming = [];
    const past = [];
    for (const job of jobs) {
      const live = ["confirmed", "on_the_way", "arrived"].includes(job.status);
      const base = {
        id: job.id, leg: job.leg, tripDate: job.trip_date, tripTime: job.trip_time, pickup: job.pickup, dropoff: job.dropoff,
        // The driver's own agreed fee — the only money figure a driver ever sees.
        feePence: job.fee_pence, feeLabel: feeLabel(job.fee_pence), status: job.status,
        onTheWayAt: job.on_the_way_at, arrivedAt: job.arrived_at, completedAt: job.completed_at,
      };
      if (!live) {
        past.push({ ...base, note: job.status === "released" ? "The office took you off this job." : job.status === "booking_cancelled" ? "The customer booking was cancelled." : "" });
        continue;
      }
      // Customer contact details are read from the booking when needed, for live jobs only.
      const booking = await ctx.deps.getBooking(job.booking_reference).catch(() => null);
      const info = booking ? legOf(booking, job.leg) : null;
      upcoming.push({
        ...base,
        reference: job.booking_reference,
        passengers: booking?.passengers ?? null, suitcases: booking?.suitcases ?? null, vehicle: booking?.vehicle ?? "",
        flightNumber: info?.flightNumber ?? "",
        customerFirstName: booking?.customerFirstName ?? "", customerMobile: booking?.customerMobile ?? "",
        notes: booking?.notes ?? "",
        change: changeView(changes.find((c) => c.job_id === job.id)),
        nextStatus: job.status === "confirmed" ? "on_the_way" : job.status === "on_the_way" ? "arrived" : "completed",
      });
    }
    upcoming.reverse();
    return json(
      {
        ok: true, today, vehicleReg: driver.vehicle_reg, available: driver.available === 1,
        offers: offers.map((o) => offerViewForDriver(o, o)), jobs: upcoming, past: past.slice(0, 60),
      },
      200, cors,
    );
  }

  if (path === "/driver-portal/jobs/vehicle" && request.method === "POST") {
    const body = await readJson(request);
    const reg = text(body.vehicleReg, 12).toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    if (reg.replace(/ /g, "").length < 4) throw new HttpError(400, "Enter your vehicle registration.");
    await db.batch([
      db.prepare("UPDATE drivers SET vehicle_reg = ?, updated_at = ? WHERE id = ?").bind(reg, at, driver.id),
      auditStatement(db, at, "driver", driver.id, "driver.vehicle_reg_updated", driver.id, { from: driver.vehicle_reg, to: reg }),
    ]);
    return json({ ok: true, vehicleReg: reg }, 200, cors);
  }

  if (path === "/driver-portal/jobs/offer-response" && request.method === "POST") {
    const body = await readJson(request);
    const action = text(body.action, 10);
    const offer = await db.prepare("SELECT * FROM job_offers WHERE id = ?").bind(text(body.offerId, 64)).first<OfferRow>();
    const mine = offer ? await db.prepare("SELECT * FROM job_offer_recipients WHERE offer_id = ? AND driver_id = ?").bind(offer.id, driver.id).first<RecipientRow>() : null;
    // A driver can only answer an offer that was sent to them.
    if (!offer || !mine) throw new HttpError(404, "Offer not found.");
    if (offer.status !== "open" || offer.expires_at <= at) throw new HttpError(409, "This offer has closed.");

    if (action === "decline") {
      await db.batch([
        db.prepare("UPDATE job_offer_recipients SET state = 'declined', bid_pence = NULL, responded_at = ? WHERE offer_id = ? AND driver_id = ?").bind(at, offer.id, driver.id),
        auditStatement(db, at, "driver", driver.id, "offer.declined", driver.id, { offerId: offer.id, reference: offer.booking_reference }),
      ]);
      const left = await db.prepare("SELECT COUNT(*) AS n FROM job_offer_recipients WHERE offer_id = ? AND state <> 'declined'").bind(offer.id).first<{ n: number }>();
      if (Number(left?.n ?? 0) === 0) {
        await db.batch([
          db.prepare("UPDATE job_offers SET status = 'declined', closed_at = ? WHERE id = ? AND status = 'open'").bind(at, offer.id),
          auditStatement(db, at, "system", "", "offer.all_declined", null, { offerId: offer.id, reference: offer.booking_reference }),
        ]);
        await raiseEscalation(ctx, {
          sourceType: "offer", sourceId: offer.id, driverId: offer.mode === "direct" ? driver.id : null, priority: "high",
          title: offer.mode === "direct" ? `${firstName(driver.name)} declined ${offer.booking_reference}` : `Every driver declined ${offer.booking_reference}`,
          body: `Pickup ${whenLabel(offer.trip_date, offer.trip_time)}. The booking is unchanged and still needs a driver.`,
        });
      }
      return json({ ok: true, state: "declined" }, 200, cors);
    }

    if (!(await eligibility(ctx, driver)).documentsOk) throw new HttpError(409, "Your documents need updating before you can take work.");
    if (!driver.vehicle_reg.trim()) throw new HttpError(409, "Add your vehicle registration first. The customer is sent part of it.");

    if (action === "bid") {
      if (offer.mode !== "bids") throw new HttpError(409, "This job has a set fee. Accept or decline it.");
      const bidPence = feeFromBody(body.bidPence);
      await db.batch([
        db.prepare("UPDATE job_offer_recipients SET state = 'bid', bid_pence = ?, bid_note = ?, responded_at = ? WHERE offer_id = ? AND driver_id = ?").bind(bidPence, text(body.note, 200), at, offer.id, driver.id),
        auditStatement(db, at, "driver", driver.id, "offer.bid", driver.id, { offerId: offer.id, reference: offer.booking_reference, bidPence, previousBidPence: mine.bid_pence }),
      ]);
      await safely("owner notice", async () =>
        ctx.deps.notifyOwner?.({ title: `Bid on ${offer.booking_reference}: ${feeLabel(bidPence)}`, body: `${firstName(driver.name)} · ${whenLabel(offer.trip_date, offer.trip_time)}. You choose the driver.`, url: "/owner/?ui=mobile#drivers", tag: `${offer.id}-${driver.id}`, priority: "normal" }),
      );
      // A bid is private: nothing about other drivers' bids is ever returned.
      return json({ ok: true, state: "bid", bidPence, bidLabel: feeLabel(bidPence) }, 200, cors);
    }

    if (action === "accept") {
      if (offer.mode === "bids") throw new HttpError(409, "Send your price for this job. The office chooses the driver.");
      const job = await confirmJob(ctx, offer, driver, offer.fee_pence ?? 0, "driver");
      return json({ ok: true, state: "accepted", jobId: job.id }, 200, cors);
    }
    throw new HttpError(400, "Choose accept, decline or bid.");
  }

  if (path === "/driver-portal/jobs/status" && request.method === "POST") {
    const body = await readJson(request);
    const next = text(body.status, 20);
    // Looked up by job id AND this driver: one driver can never touch another driver's job.
    const job = await db.prepare("SELECT * FROM driver_jobs WHERE id = ? AND driver_id = ?").bind(text(body.jobId, 64), driver.id).first<JobRow>();
    if (!job) throw new HttpError(404, "Job not found.");
    const order: Record<string, string> = { confirmed: "on_the_way", on_the_way: "arrived", arrived: "completed" };
    if (order[job.status] !== next) {
      throw new HttpError(409, job.status === "completed" ? "This job is already complete." : ["released", "booking_cancelled"].includes(job.status) ? "This job is no longer yours." : "Use the next button in order: On the way, Arrived, Complete.");
    }
    if (next === "on_the_way" && londonToUtcMs(job.trip_date, job.trip_time) - now.getTime() > 12 * 3_600_000) {
      throw new HttpError(409, "It's too early to set off for this job.");
    }
    // Location is optional evidence: the status always updates, with or without it.
    const loc = (body.location ?? null) as { lat?: unknown; lng?: unknown; accuracy?: unknown } | null;
    const lat = Number(loc?.lat);
    const lng = Number(loc?.lng);
    const accuracy = Number(loc?.accuracy);
    const located = loc != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const acc = located && Number.isFinite(accuracy) && accuracy >= 0 ? Math.min(accuracy, 100_000) : null;
    const update =
      next === "on_the_way"
        ? db.prepare("UPDATE driver_jobs SET status = 'on_the_way', on_the_way_at = ? WHERE id = ? AND status = 'confirmed'").bind(at, job.id)
        : next === "arrived"
          ? db.prepare("UPDATE driver_jobs SET status = 'arrived', arrived_at = ?, arrived_lat = ?, arrived_lng = ?, arrived_accuracy_m = ? WHERE id = ? AND status = 'on_the_way'").bind(at, located ? lat : null, located ? lng : null, acc, job.id)
          : db.prepare("UPDATE driver_jobs SET status = 'completed', completed_at = ?, completed_lat = ?, completed_lng = ?, completed_accuracy_m = ? WHERE id = ? AND status = 'arrived'").bind(at, located ? lat : null, located ? lng : null, acc, job.id);
    await db.batch([
      update,
      auditStatement(db, at, "driver", driver.id, `job.${next}`, driver.id, {
        jobId: job.id, reference: job.booking_reference, leg: job.leg,
        ...(next === "on_the_way" ? {} : { locationVerified: located, ...(located ? { lat, lng, accuracyMetres: acc } : {}) }),
        // Completion records the job only. No payment is created, approved or sent.
        ...(next === "completed" ? { paymentTriggered: false } : {}),
      }),
    ]);
    if (next === "completed") {
      await safely("owner notice", async () =>
        ctx.deps.notifyOwner?.({ title: `${firstName(driver.name)} completed ${job.booking_reference}`, body: `${whenLabel(job.trip_date, job.trip_time)}. Nothing is paid until you approve it.`, url: "/owner/?ui=mobile#drivers", tag: `${job.id}-done`, priority: "normal" }),
      );
    }
    return json({ ok: true, status: next, locationVerified: next === "on_the_way" ? null : located }, 200, cors);
  }

  if (path === "/driver-portal/jobs/change-response" && request.method === "POST") {
    const body = await readJson(request);
    const action = text(body.action, 10);
    const change = await db
      .prepare("SELECT c.*, j.driver_id, j.booking_reference, j.leg, j.status AS job_status FROM job_change_requests c JOIN driver_jobs j ON j.id = c.job_id WHERE c.id = ? AND j.driver_id = ?")
      .bind(text(body.changeId, 64), driver.id)
      .first<ChangeRow & { driver_id: string; booking_reference: string; leg: string; job_status: string }>();
    if (!change) throw new HttpError(404, "Change not found.");
    if (change.status !== "pending") throw new HttpError(409, "This change has already been answered or replaced.");
    const to = legValues(parse(change.new_values, {}));

    if (action === "accept") {
      await db.batch([
        db.prepare("UPDATE job_change_requests SET status = 'accepted', responded_at = ? WHERE id = ? AND status = 'pending'").bind(at, change.id),
        db.prepare(`UPDATE driver_jobs SET trip_date = ?, trip_time = ?, pickup = ?, dropoff = ? WHERE id = ? AND status IN ${LIVE}`).bind(to.tripDate, to.tripTime, to.pickup, to.dropoff, change.job_id),
        auditStatement(db, at, "driver", driver.id, "job.change_accepted", driver.id, { jobId: change.job_id, changeId: change.id, reference: change.booking_reference, to }),
      ]);
      await closeEscalations(ctx, "change", change.id, "Driver accepted the change");
      await safely("owner notice", async () =>
        ctx.deps.notifyOwner?.({ title: `${firstName(driver.name)} accepted the change to ${change.booking_reference}`, body: `Now ${whenLabel(to.tripDate, to.tripTime)}.`, url: "/owner/?ui=mobile#drivers", tag: change.id, priority: "normal" }),
      );
      return json({ ok: true, status: "accepted" }, 200, cors);
    }
    if (action === "cant_do") {
      await db.batch([
        db.prepare("UPDATE job_change_requests SET status = 'cant_do', responded_at = ? WHERE id = ? AND status = 'pending'").bind(at, change.id),
        // The driver stays on the job as it was. Only the owner can release or reassign.
        auditStatement(db, at, "driver", driver.id, "job.change_cant_do", driver.id, { jobId: change.job_id, changeId: change.id, reference: change.booking_reference, to, assignmentRemoved: false }),
      ]);
      await closeEscalations(ctx, "change", change.id, "Driver answered: can't do the new time");
      await raiseEscalation(ctx, {
        sourceType: "change", sourceId: change.id, driverId: driver.id, priority: "high",
        title: `${firstName(driver.name)} can't do the new time for ${change.booking_reference}`,
        body: `Changed to ${whenLabel(to.tripDate, to.tripTime)}. They are still assigned on the old details until you choose what to do.`,
      });
      return json({ ok: true, status: "cant_do", stillAssigned: true }, 200, cors);
    }
    throw new HttpError(400, "Choose Accept Change or Can't Do New Time.");
  }

  throw new HttpError(404, "Not found.");
}
