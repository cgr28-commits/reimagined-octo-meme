/**
 * Per-driver portal access.
 *
 * Saved drivers open My Jobs with a single-use magic link, then a session token.
 * A session is scoped to one DriverVehicleProfile. Job visibility uses that
 * profile key, not a name or profile key supplied in the request body.
 *
 * This module does not pay drivers. SumUp stays on customer charges and refunds.
 *
 * Later ledger migration (not implemented):
 * `driverPayAmount` is free text such as "£45" on the tracking job and booking job.
 * KV has no fixed schema, so the follow-up can add these fields on the same records:
 * - driverPayAmountPence: integer pence (source of truth, not a formatted string)
 * - driverPayStatus: "unpaid" | "paid" | "failed"
 * - driverPayPaidAt: ISO timestamp
 * - driverPayMethod: bank-payment provider id
 * - driverPayProviderReference: provider payment id
 * Backfill pence by parsing the existing text once, then stop treating the text as
 * the amount. Do not send driver pay through SumUp refunds or SumUp payouts.
 */

import type { JourneyAction, JourneyStatus } from "./tracking";
import { driverNamesMatch } from "./tracking";
import { sanitizeJobForDriver } from "./driver-job-sanitize";

export const PORTAL_LINK_PREFIX = "dpl_";
export const PORTAL_SESSION_PREFIX = "dps_";
export const PORTAL_LINK_TTL_SECONDS = 60 * 60 * 24 * 14;
export const PORTAL_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
export const DRIVER_PORTAL_COOKIE = "matni_driver_session";
export const DRIVER_PORTAL_SESSION_STORAGE_KEY = "matni-driver-portal-session";

/** Documented only. Do not write these fields until the payment ledger is built. */
export const FUTURE_DRIVER_PAY_LEDGER_FIELDS = [
  "driverPayAmountPence",
  "driverPayStatus",
  "driverPayPaidAt",
  "driverPayMethod",
  "driverPayProviderReference",
] as const;

export type PortalDriverIdentity = {
  driverName?: string;
  profileKey?: string;
};

export type AssignedJobIdentity = {
  assignedDriverName?: string;
  assignedDriverProfileKey?: string;
  assignmentStatus?: string;
};

export function normalizeDriverProfileKey(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function isPortalLinkToken(value: string | undefined | null): boolean {
  return (value ?? "").trim().startsWith(PORTAL_LINK_PREFIX);
}

export function isPortalSessionToken(value: string | undefined | null): boolean {
  return (value ?? "").trim().startsWith(PORTAL_SESSION_PREFIX);
}

/** 24 random bytes, hex-encoded. Unguessable and scoped by the prefix. */
export function createPortalToken(prefix: typeof PORTAL_LINK_PREFIX | typeof PORTAL_SESSION_PREFIX): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}${hex}`;
}

/**
 * Profile key wins when both sides have one.
 * A session key never matches a different job key, even if the display names match.
 * Legacy jobs and the configured DRIVER_ACCESS_KEY session have no profile key and match by name.
 */
export function assignedDriverMatchesIdentity(
  job: AssignedJobIdentity,
  identity: PortalDriverIdentity,
): boolean {
  const jobKey = normalizeDriverProfileKey(job.assignedDriverProfileKey);
  const sessionKey = normalizeDriverProfileKey(identity.profileKey);
  if (sessionKey && jobKey) {
    return sessionKey === jobKey;
  }
  if (sessionKey && !jobKey) {
    return driverNamesMatch(job.assignedDriverName, identity.driverName);
  }
  return driverNamesMatch(job.assignedDriverName, identity.driverName);
}

export function jobVisibleToPortalDriver(
  job: AssignedJobIdentity,
  identity: PortalDriverIdentity,
): boolean {
  const status = job.assignmentStatus ?? "unassigned";
  if (status !== "pending" && status !== "accepted") {
    return false;
  }
  return assignedDriverMatchesIdentity(job, identity);
}

export function portalDriverCanOperateJob(
  job: AssignedJobIdentity,
  identity: PortalDriverIdentity,
): boolean {
  return (job.assignmentStatus ?? "unassigned") === "accepted" && assignedDriverMatchesIdentity(job, identity);
}

/**
 * Authorization uses the session only.
 * driverName / profileKey / assignedDriverProfileKey in the body are ignored.
 */
export function authorizeDriverJobAction(
  session: {
    authorized: boolean;
    role?: "owner" | "driver";
    driverName?: string;
    profileKey?: string;
  },
  job: AssignedJobIdentity,
  body: Record<string, unknown> | null | undefined,
  mode: "view" | "operate",
): string | null {
  void body?.driverName;
  void body?.profileKey;
  void body?.driverProfileKey;
  void body?.assignedDriverProfileKey;
  void body?.assignedDriverName;

  if (!session.authorized) {
    return "Unauthorized";
  }
  if (session.role === "owner") {
    return null;
  }

  const identity: PortalDriverIdentity = {
    driverName: session.driverName,
    profileKey: session.profileKey,
  };

  if (mode === "operate") {
    if (portalDriverCanOperateJob(job, identity)) {
      return null;
    }
    if ((job.assignmentStatus ?? "unassigned") === "pending" && assignedDriverMatchesIdentity(job, identity)) {
      return "Accept this job on your dashboard before starting live tracking";
    }
    return "This job is not assigned to you";
  }

  if (!jobVisibleToPortalDriver(job, identity)) {
    return "This job is not assigned to you";
  }
  return null;
}

/**
 * Next driver actions only. Owners keep the wider API list.
 * Stop-tracking and skipping straight to complete are not offered.
 */
export function sequentialDriverJourneyActions(status: JourneyStatus | string | undefined): JourneyAction[] {
  switch (status) {
    case "idle":
    case "stopped":
      return ["start_tracking", "arrived_pickup"];
    case "tracking":
      return ["arrived_pickup"];
    case "arrived_pickup":
      return ["start_journey"];
    case "en_route":
      return ["arrived_destination"];
    case "arrived_destination":
      return ["complete_journey"];
    default:
      return [];
  }
}

export function googleMapsNavigateUrl(address: string | undefined | null): string {
  const destination = address?.trim() ?? "";
  if (!destination) return "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export function customerTelHref(mobile: string | undefined | null): string {
  const trimmed = mobile?.trim() ?? "";
  if (!trimmed) return "";
  return `tel:${trimmed.replace(/\s+/g, "")}`;
}

export function customerWhatsAppHref(mobile: string | undefined | null): string {
  const digits = (mobile ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const international = digits.startsWith("0") ? `44${digits.slice(1)}` : digits;
  const text = encodeURIComponent("Hi, this is your driver from My Airport Taxi NI.");
  return `https://wa.me/${international}?text=${text}`;
}

export function driverPortalMagicLink(siteUrl: string, accessToken: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/driver/?access=${encodeURIComponent(accessToken)}`;
}

export type DriverPortalJobExtras = {
  customerReference?: string;
  driverPayAmount?: string;
  passengers?: number;
  suitcases?: number;
  bookedVehicle?: string;
  notes?: string;
  childSeatNotes?: string;
  childSeats?: number;
  paymentMethod?: string;
  cashBalanceDue?: number;
  cashCollected?: boolean;
  cashCollectedAt?: string;
  airportAccessOption?: string | null;
  dublinArrivalTerminal?: string | null;
};

/**
 * Fresh driver jobs-list view.
 * Customer booking reference only — never the internal payment reference.
 * Forbidden fare / SumUp fields on the source object are stripped.
 */
export function buildSanitizedDriverJobView(
  job: Record<string, unknown>,
  extras: DriverPortalJobExtras,
  options: { accepted: boolean },
): Record<string, unknown> {
  const notes = [extras.notes, extras.childSeatNotes]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join("\n");
  const customerReference = extras.customerReference?.trim() || "";
  const merged: Record<string, unknown> = {
    ...job,
    driverPayAmount: extras.driverPayAmount?.trim() || undefined,
    passengers: extras.passengers,
    suitcases: extras.suitcases,
    bookedVehicle: extras.bookedVehicle?.trim() || undefined,
    notes: notes || undefined,
    childSeats: extras.childSeats,
    paymentMethod: extras.paymentMethod,
    cashBalanceDue: extras.cashBalanceDue,
    cashCollected: extras.cashCollected,
    cashCollectedAt: extras.cashCollectedAt,
    airportAccessOption: extras.airportAccessOption ?? undefined,
    dublinArrivalTerminal: extras.dublinArrivalTerminal ?? undefined,
  };
  if (customerReference) {
    merged.bookingReference = customerReference;
  } else {
    delete merged.bookingReference;
  }
  return sanitizeJobForDriver(merged, { includeCustomerMobile: options.accepted });
}

/** Driver accept lookup. Anything else on the booking record stays on the server. */
export function buildDriverAcceptLookupResponse(job: {
  id: string;
  customerName: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  driverFirstName?: string;
  driverPayAmount?: string;
  driverAssignmentStatus?: string;
  vehicle: string;
  driverCarMake?: string;
  driverCarModel?: string;
  driverReg?: string;
}): {
  id: string;
  customerName: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  driverFirstName?: string;
  driverPayAmount?: string;
  driverAssignmentStatus: string;
  vehicle: string;
  driverCarMake?: string;
  driverCarModel?: string;
  driverReg?: string;
} {
  return {
    id: job.id,
    customerName: job.customerName,
    pickupLabel: job.pickupLabel,
    dropoffLabel: job.dropoffLabel,
    tripDate: job.tripDate,
    tripTime: job.tripTime,
    driverFirstName: job.driverFirstName,
    driverPayAmount: job.driverPayAmount,
    driverAssignmentStatus: job.driverAssignmentStatus ?? "unassigned",
    vehicle: job.vehicle,
    driverCarMake: job.driverCarMake,
    driverCarModel: job.driverCarModel,
    driverReg: job.driverReg,
  };
}

/**
 * Driver accept confirmation. Only the fields the accept page needs.
 * Never include the booking record.
 */
export function buildDriverAcceptConfirmResponse(input: {
  assignmentStatus: string;
  alreadyAccepted?: boolean;
  portalUrl?: string;
}): {
  ok: true;
  assignmentStatus: string;
  alreadyAccepted?: true;
  portalUrl?: string;
} {
  const body: {
    ok: true;
    assignmentStatus: string;
    alreadyAccepted?: true;
    portalUrl?: string;
  } = {
    ok: true,
    assignmentStatus: input.assignmentStatus,
  };
  if (input.alreadyAccepted) body.alreadyAccepted = true;
  const portalUrl = input.portalUrl?.trim();
  if (portalUrl) body.portalUrl = portalUrl;
  return body;
}

type DriverAcceptJobState = {
  driverAssignmentStatus?: string;
  driverAcceptToken?: string;
  driverAcceptedAt?: string;
  driverDeclinedAt?: string;
};

/**
 * One successful accept may return a My Jobs link, then the accept token is burned.
 * The same token must not mint another portal login. Decline never mints one.
 * Only the actions "accept" and "decline" are valid.
 */
export async function completeDriverAcceptConfirmation<TJob extends DriverAcceptJobState>(input: {
  action: string;
  token: string;
  loadByToken: (token: string) => Promise<TJob | null>;
  saveJob: (job: TJob) => Promise<void>;
  deleteAcceptToken: (token: string) => Promise<void>;
  issuePortalAccess: (job: TJob) => Promise<{ portalUrl?: string; job?: TJob }>;
  now?: () => string;
}): Promise<
  | { ok: true; status: 200; body: ReturnType<typeof buildDriverAcceptConfirmResponse> }
  | { ok: false; status: number; error: string }
> {
  const action = input.action.trim().toLowerCase();
  const token = input.token.trim();
  if (!token) {
    return { ok: false, status: 400, error: "Missing token" };
  }
  if (action !== "accept" && action !== "decline") {
    return { ok: false, status: 400, error: "Action must be accept or decline." };
  }

  const job = await input.loadByToken(token);
  if (!job) {
    return { ok: false, status: 404, error: "Job not found or link expired" };
  }

  const now = (input.now ?? (() => new Date().toISOString()))();

  if (action === "decline") {
    await input.deleteAcceptToken(token);
    await input.saveJob({
      ...job,
      driverAssignmentStatus: "declined",
      driverAcceptedAt: undefined,
      driverDeclinedAt: now,
      driverAcceptToken: undefined,
    });
    return {
      ok: true,
      status: 200,
      body: buildDriverAcceptConfirmResponse({ assignmentStatus: "declined" }),
    };
  }

  if (job.driverAssignmentStatus === "declined") {
    await input.deleteAcceptToken(token);
    await input.saveJob({ ...job, driverAcceptToken: undefined });
    return { ok: false, status: 404, error: "Job not found or link expired" };
  }

  if (job.driverAssignmentStatus === "accepted") {
    await input.deleteAcceptToken(token);
    await input.saveJob({ ...job, driverAcceptToken: undefined });
    return {
      ok: false,
      status: 409,
      error: "This job has already been accepted. Open the My Jobs link from your assignment email.",
    };
  }

  const issued = await input.issuePortalAccess(job);
  const acceptedJob = issued.job ?? job;
  await input.deleteAcceptToken(token);
  await input.saveJob({
    ...acceptedJob,
    driverAssignmentStatus: "accepted",
    driverAcceptedAt: now,
    driverDeclinedAt: undefined,
    driverAcceptToken: undefined,
  });
  return {
    ok: true,
    status: 200,
    body: buildDriverAcceptConfirmResponse({
      assignmentStatus: "accepted",
      portalUrl: issued.portalUrl,
    }),
  };
}
