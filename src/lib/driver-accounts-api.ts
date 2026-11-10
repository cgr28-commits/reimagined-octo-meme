/**
 * Stage 1 driver accounts — browser client (owner dashboard + driver portal).
 * The Worker only serves these routes where a DRIVER_DB binding exists (isolated staging).
 */
import { resolveWorkerBaseUrl } from "@/lib/worker-api";

export const DRIVER_ACCOUNT_SESSION_HEADER = "X-Driver-Account-Session";
const SESSION_STORAGE_KEY = "matni-driver-account-session";

export type DocumentState = "missing" | "pending" | "rejected" | "expired" | "expiring" | "valid";
export type DriverAccountStatus = "invited" | "applied" | "approved" | "declined" | "suspended" | "removed";

export type DocumentSummaryItem = {
  kind: string;
  label: string;
  required: boolean;
  state: DocumentState;
  expiresOn: string | null;
};

export type DriverDocument = {
  id: string;
  kind: string;
  label: string;
  reference: string;
  expiresOn: string;
  status: "pending" | "accepted" | "rejected" | "superseded";
  state: DocumentState;
  reviewNote: string;
  submittedAt: string;
};

export type OwnerDriver = {
  id: string;
  name: string;
  email: string;
  mobile: string;
  status: DriverAccountStatus;
  statusReason: string;
  available: boolean;
  operatorName: string;
  operatorLicenceNumber: string;
  vehicleSummary: string;
  createdAt: string;
  documents?: DocumentSummaryItem[];
  attention?: string[];
  unreadMessages?: number;
  urgentMessages?: number;
  canReceiveOffers?: boolean;
};

export type ReviewBooking = {
  reference: string;
  tripDate: string;
  tripTime: string;
  pickup: string;
  customerName: string;
  leg: "outbound" | "return";
};

export type ReviewItemStatus = "needs_replacement" | "replacement_confirmed" | "cancelled" | "acknowledged";

export type ReviewItem = {
  id: string;
  reference: string;
  leg: "outbound" | "return";
  tripDate: string;
  tripTime: string;
  pickup: string;
  customerName: string;
  matchMethod: "driver_id" | "contact";
  originalDriverId: string;
  originalDriverName: string;
  originalAssignment: Record<string, string>;
  suspensionReason: string;
  status: ReviewItemStatus;
  statusNote: string;
  statusDetail: { otherDriver?: string; verified?: boolean };
  statusAt: string | null;
};

export type OwnerAlert = {
  id: string;
  kind: string;
  driverId: string | null;
  title: string;
  detail: { lookupFailed?: boolean; reason?: string; action?: string };
  createdAt: string;
  items: ReviewItem[];
  unresolved: number;
};

export const REVIEW_STATUS_LABEL: Record<ReviewItemStatus, string> = {
  needs_replacement: "Needs replacement",
  replacement_confirmed: "Replacement confirmed",
  cancelled: "Cancelled",
  acknowledged: "Acknowledged",
};

export type DriverMessage = {
  id: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  urgent: boolean;
  category: string;
  categoryLabel: string;
  handledAt: string | null;
};

export type UrgentReport = {
  id: string;
  driverId: string;
  driverName: string;
  category: string;
  categoryLabel: string;
  body: string;
  createdAt: string;
};

export type DriversSummary = { unreadMessages: number; urgent: UrgentReport[]; alerts: OwnerAlert[] };

export type OwnerDriverDetail = {
  driver: OwnerDriver;
  documents: DriverDocument[];
  summary: DocumentSummaryItem[];
  attention: string[];
  missingForApproval: string[];
  audit: { seq: number; at: string; actor_type: string; action: string; detail: Record<string, unknown> }[];
  messages: DriverMessage[];
  canReceiveOffers: boolean;
  alerts: OwnerAlert[];
};

export type DriverMe = {
  driver: Omit<OwnerDriver, "statusReason" | "createdAt">;
  documents: DriverDocument[];
  summary: DocumentSummaryItem[];
  contactOffice: { mode: "phone"; phone: string } | { mode: "message" };
};

export class DriverAccountsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: { method?: string; headers?: Record<string, string>; body?: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${resolveWorkerBaseUrl()}${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        Accept: "application/json",
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new DriverAccountsError("No connection. Check your signal and try again.", 0);
  }
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new DriverAccountsError(String(payload.error || "Something went wrong."), response.status, payload);
  }
  return payload as T;
}

// ---------- owner ----------

const owner = (ownerKey: string) => ({ "X-Owner-Key": ownerKey.trim() });

export const ownerDrivers = {
  list: (key: string) => request<{ drivers: OwnerDriver[]; alerts: OwnerAlert[] }>("/owner/driver-accounts", { headers: owner(key) }),
  summary: (key: string) => request<DriversSummary>("/owner/driver-accounts/summary", { headers: owner(key) }),
  markHandled: (key: string, messageId: string) =>
    request<{ ok: true }>("/owner/driver-accounts/messages/handled", { headers: owner(key), body: { messageId } }),
  /** Only for an alert that lists no bookings (the booking check failed); needs a reason. */
  acknowledgeAlert: (key: string, alertId: string, note: string) =>
    request<{ ok: true }>("/owner/driver-accounts/alerts/resolve", { headers: owner(key), body: { alertId, note } }),
  updateReviewItem: (key: string, itemId: string, status: ReviewItemStatus, note: string) =>
    request<{ status: ReviewItemStatus; alertResolved: boolean }>("/owner/driver-accounts/alerts/item", {
      headers: owner(key),
      body: { itemId, status, note },
    }),
  detail: (key: string, id: string) =>
    request<OwnerDriverDetail>(`/owner/driver-accounts/detail?id=${encodeURIComponent(id)}`, { headers: owner(key) }),
  invite: (key: string, body: { name: string; email: string; mobile: string }) =>
    request<{ driverId: string; inviteToken: string; expiresAt: string }>("/owner/driver-accounts/invite", { headers: owner(key), body }),
  signInLink: (key: string, driverId: string) =>
    request<{ signInToken: string; expiresAt: string }>("/owner/driver-accounts/sign-in-link", { headers: owner(key), body: { driverId } }),
  setStatus: (key: string, driverId: string, action: string, reason: string) =>
    request<{ status: DriverAccountStatus; reviewBookings: ReviewBooking[] }>("/owner/driver-accounts/status", {
      headers: owner(key),
      body: { driverId, action, reason },
    }),
  reviewDocument: (key: string, documentId: string, decision: "accept" | "reject", note: string) =>
    request<{ ok: true }>("/owner/driver-accounts/document-review", { headers: owner(key), body: { documentId, decision, note } }),
  markMessagesRead: (key: string, driverId: string) =>
    request<{ ok: true }>("/owner/driver-accounts/messages/read", { headers: owner(key), body: { driverId } }),
  getSupportContact: (key: string) => request<{ phone: string }>("/owner/driver-accounts/support-contact", { headers: owner(key) }),
  setSupportContact: (key: string, phone: string) =>
    request<{ phone: string }>("/owner/driver-accounts/support-contact", { headers: owner(key), body: { phone } }),
};

/** Portal link the owner copies and shares personally (Stage 1 sends nothing). Token rides in the #fragment. */
export function driverPortalLink(kind: "invite" | "signin", token: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/driver-portal/#${kind}=${encodeURIComponent(token)}`;
}

// ---------- driver ----------

export function readDriverSession(): string {
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function storeDriverSession(token: string): void {
  try {
    if (token) window.localStorage.setItem(SESSION_STORAGE_KEY, token);
    else window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* private mode — session lasts for this page only */
  }
}

const driver = (session: string) => ({ [DRIVER_ACCOUNT_SESSION_HEADER]: session });

export const driverAccount = {
  acceptInvite: (body: {
    token: string;
    mobile: string;
    operatorName: string;
    operatorLicenceNumber: string;
    vehicleSummary: string;
    confirmOwnOperatorLicence: boolean;
  }) => request<{ sessionToken: string }>("/driver-portal/account/accept-invite", { body }),
  signIn: (token: string) => request<{ sessionToken: string }>("/driver-portal/account/sign-in", { body: { token } }),
  me: (session: string) => request<DriverMe>("/driver-portal/account/me", { headers: driver(session) }),
  setAvailable: (session: string, available: boolean) =>
    request<{ available: boolean }>("/driver-portal/account/availability", { headers: driver(session), body: { available } }),
  submitDocument: (session: string, body: { kind: string; expiresOn: string; reference: string }) =>
    request<{ documentId: string }>("/driver-portal/account/documents", { headers: driver(session), body }),
  messageOffice: (session: string, message: string, category: string) =>
    request<{ messageId: string; priority: "normal" | "urgent" }>("/driver-portal/account/contact-office", {
      headers: driver(session),
      body: { message, category },
    }),
  signOut: (session: string) => request<{ ok: true }>("/driver-portal/account/sign-out", { headers: driver(session), body: {} }),
};

export const DOCUMENT_OPTIONS: { kind: string; label: string }[] = [
  { kind: "operator_licence", label: "Taxi operator licence" },
  { kind: "phv_driver_licence", label: "Taxi driver licence" },
  { kind: "vehicle_licence", label: "Vehicle licence" },
  { kind: "insurance", label: "Hire & reward insurance" },
  { kind: "dvla_licence", label: "DVA/DVLA driving licence" },
];

/** "2026-11-30" → "30 Nov 2026" (also rewrites ISO dates inside sentences). */
export function ukDate(text: string): string {
  return text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_m, y: string, mo: string, d: string) => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${Number(d)} ${months[Number(mo) - 1] ?? mo} ${y}`;
  });
}

export function documentStateLabel(state: DocumentState, expiresOn: string | null): string {
  switch (state) {
    case "missing":
      return "Not added";
    case "pending":
      return "Being checked";
    case "rejected":
      return "Needs fixing";
    case "expired":
      return "Expired";
    case "expiring":
      return `Expires ${ukDate(expiresOn ?? "")}`.trim();
    default:
      return expiresOn ? `Valid to ${ukDate(expiresOn)}` : "Valid";
  }
}

export function documentStateTone(state: DocumentState): "green" | "amber" | "red" | "grey" | "blue" {
  if (state === "valid") return "green";
  if (state === "expiring" || state === "pending") return "amber";
  if (state === "expired" || state === "rejected") return "red";
  return "grey";
}

export const STATUS_LABEL: Record<DriverAccountStatus, string> = {
  invited: "Invited",
  applied: "Waiting for review",
  approved: "Approved",
  declined: "Declined",
  suspended: "Suspended",
  removed: "Removed",
};

/** What a driver can tell the office. Urgent ones go to the top of the Owner Dashboard. */
export const MESSAGE_OPTIONS: { category: string; label: string; urgent: boolean }[] = [
  { category: "general", label: "Message", urgent: false },
  { category: "running_late", label: "Running late", urgent: false },
  { category: "breakdown", label: "Breakdown", urgent: true },
  { category: "accident", label: "Accident", urgent: true },
  { category: "cant_complete", label: "Can't complete a job", urgent: true },
];

/** Public customer line (AI receptionist). Never allowed as the driver-support number. */
export const AI_RECEPTIONIST_DIGITS = "02896022952";

/** Same rules as the Worker: UK number, normalised to 0XXXXXXXXXX. */
export function normaliseUkPhone(raw: string): string {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+44")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("0044")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("44") && digits.length === 12) digits = `0${digits.slice(2)}`;
  digits = digits.replace(/\D/g, "");
  return /^0\d{10}$/.test(digits) ? digits : "";
}

export function checkSupportPhone(raw: string): { ok: boolean; phone: string; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, phone: "", error: "" };
  const phone = normaliseUkPhone(trimmed);
  if (!phone) return { ok: false, phone: "", error: "Enter a full UK number, e.g. 07700 900123." };
  if (phone === AI_RECEPTIONIST_DIGITS) {
    return { ok: false, phone, error: "That's the customer line that goes to the AI receptionist. Use a separate number." };
  }
  return { ok: true, phone, error: "" };
}
