import { formatUkDateTimeValue, parseLondonLocalIso } from "./uk-time";

/** Lifecycle of an active/completed driver journey (owner/driver controls). */
export type JourneyStatus =
  | "idle"
  | "tracking"
  | "arrived_pickup"
  | "en_route"
  | "arrived_destination"
  | "completed"
  | "stopped";

export type JourneyAction =
  | "start_tracking"
  | "arrived_pickup"
  | "start_journey"
  | "arrived_destination"
  | "complete_journey"
  | "stop_tracking";

export const JOURNEY_STATUS_LABELS: Record<JourneyStatus, string> = {
  idle: "Driver preparing",
  tracking: "Driver on the way",
  arrived_pickup: "Driver has arrived",
  en_route: "Journey underway",
  arrived_destination: "Arrived at destination",
  completed: "Journey completed",
  stopped: "Tracking stopped",
};

export type TrackingJobRecord = {
  token: string;
  createdAt: string;
  customerName: string;
  customerEmail?: string;
  customerMobile: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  /** Wall-clock pickup in Europe/London as ISO-like local string YYYY-MM-DDTHH:mm */
  pickupAt: string;
  paymentReference?: string;
  /** Outbound vs return leg for round-trip bookings */
  journeyLeg?: "outbound" | "return";
  /** Token of the paired leg (outbound ↔ return) */
  pairedToken?: string;
  driverLat?: number;
  driverLng?: number;
  driverUpdatedAt?: string;
  sharingActive: boolean;
  /**
   * ISO timestamp when the “tracking is now available” reminder was emailed
   * (sent once when the customer window opens, ~1 hour before pickup).
   */
  sharingReminderSentAt?: string;
  /** ISO timestamp when the post-trip Google review request was scheduled (on journey complete). */
  reviewRequestScheduledAt?: string;
  /** ISO timestamp when the review request email becomes due (~2h after completion by default). */
  reviewRequestDueAt?: string;
  /** ISO timestamp when the post-trip Google review request email was sent */
  reviewRequestSentAt?: string;
  /** ISO timestamp of the last failed automated/manual review send attempt */
  reviewRequestFailedAt?: string;
  /** Last review-request send error (Resend/provider) — does not affect journey completion */
  reviewRequestLastError?: string;
  customerSharingActive?: boolean;
  customerLat?: number;
  customerLng?: number;
  customerUpdatedAt?: string;
  isAirportTrip?: boolean;
  isFromAirport?: boolean;
  airportCode?: string;
  flightNumber?: string;
  termsAcceptedAt?: string;
  termsVersion?: string;
  marketingOptIn?: boolean;
  marketingOptInAt?: string;
  marketingConsentVersion?: string;
  /** Set when a refund is issued — job stays visible on the driver dashboard */
  refundedAt?: string;
  refundAmountLabel?: string;
  /** Name of the driver sharing live location */
  activeDriverName?: string;
  /** Driver the job is assigned to (must accept before it appears on their dashboard) */
  assignedDriverName?: string;
  assignmentStatus?: JobAssignmentStatus;
  assignedAt?: string;
  acceptedAt?: string;
  declinedAt?: string;
  /**
   * Snapshot of assigned-driver operational details at assignment time.
   * Immutable for the journey even if the saved driver profile is edited later.
   */
  assignedDriverMobile?: string;
  assignedDriverEmail?: string;
  assignedDriverCarMake?: string;
  assignedDriverCarModel?: string;
  assignedDriverCarColour?: string;
  assignedDriverReg?: string;
  /** Owner-entered amount paid to the driver for this journey (not the customer fare). */
  driverPayAmount?: string;
  /** Count of GPS points retained for audit (owner only in API responses) */
  driverLocationPointCount?: number;
  driverLocationRecordedFrom?: string;
  driverLocationRecordedTo?: string;
  /** Operational journey lifecycle for customer status + chargeback evidence */
  journeyStatus?: JourneyStatus;
  trackingStartedAt?: string;
  arrivedPickupAt?: string;
  journeyStartedAt?: string;
  arrivedDestinationAt?: string;
  journeyCompletedAt?: string;
  trackingStoppedAt?: string;
  /**
   * Arrival-at-pickup customer notification (idempotent).
   * Prefer WhatsApp Business API / SMS when configured; Resend email is the current fallback.
   */
  arrivalNotificationStatus?: "sent" | "failed" | "not_configured" | "skipped";
  arrivalNotificationSentAt?: string;
  arrivalNotificationProvider?: "email" | "sms" | "whatsapp";
  arrivalNotificationError?: string;
  /**
   * Driver-on-the-way customer notification (idempotent).
   * Email/status only — no website live-tracking link and no automated WhatsApp Live Location.
   */
  onTheWayNotificationStatus?: "sent" | "failed" | "not_configured" | "skipped";
  onTheWayNotificationSentAt?: string;
  onTheWayNotificationProvider?: "email" | "sms" | "whatsapp";
  onTheWayNotificationError?: string;
};

export type DriverLocationPoint = {
  lat: number;
  lng: number;
  recordedAt: string;
  driverName?: string;
  accuracyMeters?: number;
  speedMps?: number;
  headingDegrees?: number;
};

export type JobAssignmentStatus = "unassigned" | "pending" | "accepted" | "declined";

export type TrackingSessionRecord = {
  sessionToken: string;
  jobToken: string;
  createdAt: string;
  expiresAt: string;
  driverName?: string;
  createdByRole: "owner" | "driver";
};

export function journeyStatusOf(job: Pick<TrackingJobRecord, "journeyStatus">): JourneyStatus {
  return job.journeyStatus ?? "idle";
}

export function customerJourneyLabel(job: Pick<TrackingJobRecord, "journeyStatus" | "sharingActive">): string {
  const status = journeyStatusOf(job);
  if (status === "idle" && job.sharingActive) {
    return JOURNEY_STATUS_LABELS.tracking;
  }
  return JOURNEY_STATUS_LABELS[status];
}

/** Valid next actions from a journey status (owner/driver one-tap controls). */
export function allowedJourneyActions(status: JourneyStatus): JourneyAction[] {
  switch (status) {
    case "idle":
      // Start GPS, mark arrived (WhatsApp), or complete offline without live GPS.
      return ["start_tracking", "arrived_pickup", "complete_journey"];
    case "stopped":
      // Stop Live Tracking ≠ Complete Journey — owner can still arrive or mark finished.
      return ["start_tracking", "arrived_pickup", "complete_journey"];
    case "tracking":
      return ["arrived_pickup", "stop_tracking", "complete_journey"];
    case "arrived_pickup":
      return ["start_journey", "stop_tracking", "complete_journey"];
    case "en_route":
      return ["arrived_destination", "stop_tracking", "complete_journey"];
    case "arrived_destination":
      return ["complete_journey", "stop_tracking"];
    case "completed":
      return [];
    default:
      // Unknown/legacy statuses: still allow arrive + complete (safe fallbacks).
      return ["start_tracking", "arrived_pickup", "complete_journey"];
  }
}

export function applyJourneyAction(
  job: TrackingJobRecord,
  action: JourneyAction,
  atIso = new Date().toISOString(),
): { ok: true; job: TrackingJobRecord } | { ok: false; error: string } {
  const current = journeyStatusOf(job);
  if (!allowedJourneyActions(current).includes(action)) {
    return {
      ok: false,
      error: `Cannot ${action.replaceAll("_", " ")} while journey is ${JOURNEY_STATUS_LABELS[current].toLowerCase()}`,
    };
  }

  const next: TrackingJobRecord = { ...job };

  switch (action) {
    case "start_tracking":
      next.journeyStatus = "tracking";
      next.trackingStartedAt = atIso;
      next.sharingActive = true;
      delete next.trackingStoppedAt;
      break;
    case "arrived_pickup":
      next.journeyStatus = "arrived_pickup";
      // Preserve the original arrival timestamp on any re-application path.
      if (!next.arrivedPickupAt) {
        next.arrivedPickupAt = atIso;
      }
      next.sharingActive = true;
      break;
    case "start_journey":
      next.journeyStatus = "en_route";
      next.journeyStartedAt = atIso;
      next.sharingActive = true;
      break;
    case "arrived_destination":
      next.journeyStatus = "arrived_destination";
      next.arrivedDestinationAt = atIso;
      next.sharingActive = true;
      break;
    case "complete_journey":
      next.journeyStatus = "completed";
      next.journeyCompletedAt = atIso;
      next.sharingActive = false;
      // Close live sharing safely; keep GPS history / evidence fields intact.
      if (!next.trackingStoppedAt) {
        next.trackingStoppedAt = atIso;
      }
      delete next.driverLat;
      delete next.driverLng;
      delete next.driverUpdatedAt;
      delete next.activeDriverName;
      break;
    case "stop_tracking":
      next.journeyStatus = current === "completed" ? "completed" : "stopped";
      next.trackingStoppedAt = atIso;
      next.sharingActive = false;
      delete next.driverLat;
      delete next.driverLng;
      delete next.driverUpdatedAt;
      delete next.activeDriverName;
      break;
  }

  return { ok: true, job: next };
}

export function normalizeDriverName(name: string): string {
  return name.trim();
}

export function driverNamesMatch(
  left: string | undefined,
  right: string | undefined,
): boolean {
  if (!left?.trim() || !right?.trim()) {
    return false;
  }

  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function jobAssignmentStatus(
  job: Pick<TrackingJobRecord, "assignmentStatus">,
): JobAssignmentStatus {
  return job.assignmentStatus ?? "unassigned";
}

export function jobVisibleToDriver(
  job: Pick<TrackingJobRecord, "assignedDriverName" | "assignmentStatus">,
  driverName: string,
): boolean {
  const status = jobAssignmentStatus(job);
  if (status !== "pending" && status !== "accepted") {
    return false;
  }

  return driverNamesMatch(job.assignedDriverName, driverName);
}

export function driverCanOperateJob(
  job: Pick<TrackingJobRecord, "assignedDriverName" | "assignmentStatus">,
  driverName: string,
): boolean {
  return jobAssignmentStatus(job) === "accepted" && driverNamesMatch(job.assignedDriverName, driverName);
}

export function jobPendingForDriver(
  job: Pick<TrackingJobRecord, "assignedDriverName" | "assignmentStatus">,
  driverName: string,
): boolean {
  return jobAssignmentStatus(job) === "pending" && driverNamesMatch(job.assignedDriverName, driverName);
}

export function isAirportPickupJob(
  job: Pick<TrackingJobRecord, "isAirportTrip" | "isFromAirport">,
): boolean {
  return Boolean(job.isAirportTrip && job.isFromAirport);
}

export function driverCanViewFlightInfo(
  job: Pick<
    TrackingJobRecord,
    "assignedDriverName" | "assignmentStatus" | "isAirportTrip" | "isFromAirport"
  >,
  driverName: string,
): boolean {
  return isAirportPickupJob(job) && jobVisibleToDriver(job, driverName);
}

/** Customer map freshness (hide stale live pin). */
export const LOCATION_STALE_MS = 5 * 60 * 1000;
/** Driver dashboard warning when GPS updates stop (iPhone/browser suspension). */
export const DRIVER_GPS_STALE_MS = 2 * 60 * 1000;
/** Minimum metres between stored GPS audit points (unless interval elapsed). */
export const GPS_MIN_MOVE_METERS = 25;
/** Minimum seconds between stored GPS audit points when barely moving. */
export const GPS_MIN_INTERVAL_MS = 20_000;
/** Default retention for GPS audit trail (seconds). Overridable via WORKER env. */
export const DEFAULT_GPS_HISTORY_TTL_SECONDS = 60 * 60 * 24 * 400;
/** Tracking session lifetime for GPS posts (no long-lived owner key on device). */
export const TRACKING_SESSION_TTL_SECONDS = 60 * 60 * 8;

export function isLocationFresh(
  updatedAt: string | undefined,
  now = Date.now(),
  maxAgeMs = LOCATION_STALE_MS,
): boolean {
  if (!updatedAt) {
    return false;
  }

  const updated = new Date(updatedAt).getTime();
  if (Number.isNaN(updated)) {
    return false;
  }

  return now - updated < maxAgeMs;
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

export function shouldStoreGpsPoint(
  previous: DriverLocationPoint | undefined,
  next: Pick<DriverLocationPoint, "lat" | "lng" | "recordedAt">,
): boolean {
  if (!previous) {
    return true;
  }

  const prevAt = new Date(previous.recordedAt).getTime();
  const nextAt = new Date(next.recordedAt).getTime();
  if (!Number.isFinite(prevAt) || !Number.isFinite(nextAt)) {
    return true;
  }

  if (nextAt - prevAt >= GPS_MIN_INTERVAL_MS) {
    return true;
  }

  return haversineMeters(previous.lat, previous.lng, next.lat, next.lng) >= GPS_MIN_MOVE_METERS;
}

export type TrackingWindow = {
  open: boolean;
  opensAt: string;
  closesAt: string;
  pickupAt: string;
  reason?: "too_early" | "too_late" | "open";
};

const OPEN_BEFORE_MS = 60 * 60 * 1000;
const CLOSE_AFTER_MS = 90 * 60 * 1000;

/** Default delay after journey completion before the Google review email (minutes). */
export const DEFAULT_REVIEW_REQUEST_DELAY_MINUTES = 120;

/** Default delay in ms (override via REVIEW_REQUEST_DELAY_MINUTES worker var). */
export const REVIEW_REQUEST_DELAY_MS = DEFAULT_REVIEW_REQUEST_DELAY_MINUTES * 60 * 1000;

/** How long before pickup the customer-facing live map opens. */
export const CUSTOMER_TRACKING_OPEN_BEFORE_MS = OPEN_BEFORE_MS;

export type ReviewRequestStatus = "not_scheduled" | "scheduled" | "sent" | "failed";

export function resolveReviewRequestDelayMs(configuredMinutes?: string | number): number {
  const raw =
    typeof configuredMinutes === "number"
      ? configuredMinutes
      : Number(String(configuredMinutes ?? "").trim());
  if (Number.isFinite(raw) && raw >= 0 && raw <= 60 * 24 * 14) {
    return Math.round(raw) * 60 * 1000;
  }
  return REVIEW_REQUEST_DELAY_MS;
}

export function getReviewRequestStatus(
  job: Pick<
    TrackingJobRecord,
    | "journeyStatus"
    | "journeyCompletedAt"
    | "reviewRequestScheduledAt"
    | "reviewRequestSentAt"
    | "reviewRequestFailedAt"
  >,
): ReviewRequestStatus {
  if (job.reviewRequestSentAt?.trim()) {
    return "sent";
  }
  if (job.reviewRequestFailedAt?.trim()) {
    return "failed";
  }
  if (job.reviewRequestScheduledAt?.trim() || journeyStatusOf(job) === "completed") {
    if (journeyStatusOf(job) === "completed" || job.journeyCompletedAt?.trim()) {
      return job.reviewRequestScheduledAt?.trim() ? "scheduled" : "not_scheduled";
    }
  }
  return "not_scheduled";
}

/**
 * Idempotently schedule a review request when a journey is marked completed.
 * Does nothing if already scheduled/sent, or if the journey is not completed.
 */
export function ensureReviewRequestScheduled(
  job: TrackingJobRecord,
  delayMs: number = REVIEW_REQUEST_DELAY_MS,
  nowIso = new Date().toISOString(),
): TrackingJobRecord {
  if (journeyStatusOf(job) !== "completed") {
    return job;
  }
  if (job.reviewRequestSentAt?.trim()) {
    return job;
  }
  if (job.reviewRequestScheduledAt?.trim() && job.reviewRequestDueAt?.trim()) {
    return job;
  }

  const completedAt = job.journeyCompletedAt?.trim() || nowIso;
  const completedMs = Date.parse(completedAt);
  const dueAt = Number.isFinite(completedMs)
    ? new Date(completedMs + delayMs).toISOString()
    : new Date(Date.parse(nowIso) + delayMs).toISOString();

  return {
    ...job,
    journeyCompletedAt: job.journeyCompletedAt ?? completedAt,
    reviewRequestScheduledAt: job.reviewRequestScheduledAt ?? nowIso,
    reviewRequestDueAt: job.reviewRequestDueAt ?? dueAt,
  };
}

export function getReviewRequestDueAt(
  job: Pick<TrackingJobRecord, "reviewRequestDueAt" | "journeyCompletedAt">,
  delayMs: number = REVIEW_REQUEST_DELAY_MS,
): Date | null {
  if (job.reviewRequestDueAt?.trim()) {
    const parsed = Date.parse(job.reviewRequestDueAt);
    return Number.isFinite(parsed) ? new Date(parsed) : null;
  }
  if (job.journeyCompletedAt?.trim()) {
    const completedMs = Date.parse(job.journeyCompletedAt);
    return Number.isFinite(completedMs) ? new Date(completedMs + delayMs) : null;
  }
  return null;
}

/** True when a completed journey’s review email is due and not yet sent. */
export function isReviewRequestDue(
  job: Pick<
    TrackingJobRecord,
    | "journeyStatus"
    | "journeyCompletedAt"
    | "reviewRequestDueAt"
    | "reviewRequestSentAt"
    | "refundedAt"
  >,
  delayMs: number = REVIEW_REQUEST_DELAY_MS,
  now = Date.now(),
): boolean {
  if (job.reviewRequestSentAt?.trim()) {
    return false;
  }
  if (job.refundedAt?.trim()) {
    return false;
  }
  if (journeyStatusOf(job) !== "completed") {
    return false;
  }
  const dueAt = getReviewRequestDueAt(job, delayMs);
  return dueAt !== null && now >= dueAt.getTime();
}

export function buildPickupDateTimeLocal(tripDate: string, tripTime: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate) || !/^\d{2}:\d{2}$/.test(tripTime)) {
    return null;
  }

  return `${tripDate}T${tripTime}`;
}

function parseLondonLocal(isoLocal: string): Date | null {
  const trimmed = isoLocal.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return parseLondonLocalIso(`${trimmed}:00`);
  }
  return parseLondonLocalIso(trimmed);
}

export function getJobCompletionAt(pickupAt: string): Date | null {
  const pickup = parseLondonLocal(pickupAt);
  if (!pickup) {
    return null;
  }

  return new Date(pickup.getTime() + CLOSE_AFTER_MS);
}

export function getTrackingWindow(pickupAt: string, now = new Date()): TrackingWindow {
  const pickup = parseLondonLocal(pickupAt);
  if (!pickup) {
    return {
      open: false,
      opensAt: pickupAt,
      closesAt: pickupAt,
      pickupAt,
      reason: "too_early",
    };
  }

  const opensAt = new Date(pickup.getTime() - OPEN_BEFORE_MS);
  const closesAt = new Date(pickup.getTime() + CLOSE_AFTER_MS);
  const open = now >= opensAt && now <= closesAt;

  return {
    open,
    opensAt: opensAt.toISOString(),
    closesAt: closesAt.toISOString(),
    pickupAt,
    reason: now < opensAt ? "too_early" : now > closesAt ? "too_late" : "open",
  };
}

export function formatLondonDateTime(iso: string): string {
  return formatUkDateTimeValue(iso, { withZoneLabel: true, includeYear: false });
}

export function buildPublicTrackUrl(token: string, siteUrl = "https://www.myairporttaxini.co.uk"): string {
  return `${siteUrl.replace(/\/$/, "")}/track/?id=${encodeURIComponent(token)}`;
}

/**
 * Choose tracking jobs that may be marked refunded with booking A.
 * Never includes a paired/related job whose paymentReference differs.
 */
export function selectTrackingJobsForRefundMark(input: {
  primary: TrackingJobRecord;
  relatedByPaymentRef: TrackingJobRecord[];
  pairedJob?: TrackingJobRecord | null;
}): TrackingJobRecord[] {
  const paymentRef = input.primary.paymentReference?.trim() || "";
  const byToken = new Map<string, TrackingJobRecord>();
  byToken.set(input.primary.token, input.primary);

  for (const job of input.relatedByPaymentRef) {
    if (!job?.token) continue;
    if (!paymentRef) {
      // Without a payment ref, never fan out — only the primary token is safe.
      continue;
    }
    if (job.paymentReference?.trim() === paymentRef) {
      byToken.set(job.token, job);
    }
  }

  const paired = input.pairedJob ?? null;
  if (paired?.token && paymentRef && paired.paymentReference?.trim() === paymentRef) {
    byToken.set(paired.token, paired);
  }

  return [...byToken.values()];
}

/** True once the customer tracking window has opened (~1 hour before pickup) and not yet closed. */
export function isTrackingAvailableReminderDue(pickupAt: string, now = Date.now()): boolean {
  const window = getTrackingWindow(pickupAt, new Date(now));
  return window.open;
}

/**
 * Whether the ~1-hour tracking-available reminder should be sent for this job.
 * Pure check — does not send email or mutate state.
 */
export function evaluateTrackingAvailableReminder(
  job: Pick<
    TrackingJobRecord,
    "token" | "refundedAt" | "sharingReminderSentAt" | "customerEmail" | "pickupAt"
  >,
  now = Date.now(),
): "not_eligible" | "eligible" {
  if (job.sharingReminderSentAt) {
    return "not_eligible";
  }
  if (!job.customerEmail?.trim()) {
    return "not_eligible";
  }
  if (job.refundedAt?.trim()) {
    return "not_eligible";
  }
  if (!resolveEmailTrackUrl(job)) {
    return "not_eligible";
  }
  if (!isTrackingAvailableReminderDue(job.pickupAt, now)) {
    return "not_eligible";
  }
  return "eligible";
}

/**
 * Secure customer track URL for emails. Returns undefined when the job is missing,
 * refunded/cancelled, or has no token — never invents links from payment refs or secrets.
 */
export function resolveEmailTrackUrl(
  job: Pick<TrackingJobRecord, "token" | "refundedAt"> | null | undefined,
  siteUrl?: string,
): string | undefined {
  const token = job?.token?.trim();
  if (!token) {
    return undefined;
  }
  if (job?.refundedAt?.trim()) {
    return undefined;
  }
  return buildPublicTrackUrl(token, siteUrl);
}

export function generateTrackingToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function generateTrackingSessionToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
