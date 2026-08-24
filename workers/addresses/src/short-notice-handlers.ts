/**
 * Short-notice booking: create / list / approve / decline / pay-via-SumUp.
 */

import type { PaidBookingDetails } from "../shared/booking-notifications";
import {
  computeShortNoticePaymentExpiryIso,
  findBlockingUnavailablePeriod,
  formatUnavailablePeriodRangeLabel,
  listActiveUnavailablePeriods,
  materialJourneyFingerprint,
  vehicleServiceLabel,
} from "../shared/booking-notice";
import {
  isShortNoticePayable,
  sanitizeCustomerResponseNote,
  type ShortNoticeBookingRecord,
} from "../shared/short-notice-booking";
import {
  buildShortNoticePaymentLinkEmail,
  isValidCustomerEmail,
} from "../shared/short-notice-payment-email";
import { buildShortNoticeAlternativeOfferEmail } from "../shared/short-notice-alternative-email";
import { parseLondonLocalDateTime } from "../shared/uk-time";
import {
  addUnavailablePeriod,
  bookingSettingsPublicView,
  deleteUnavailablePeriod,
  getBookingSettings,
  updateUnavailablePeriod,
} from "./booking-settings-store";
import {
  generatePaymentToken,
  generateShortNoticeReference,
  getShortNoticeByAcceptToken,
  getShortNoticeByReference,
  getShortNoticeByToken,
  listArchivedShortNoticeBookings,
  listOpenShortNoticeBookings,
  saveShortNoticeBooking,
} from "./short-notice-store";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import {
  trySendBrandedCustomerEmail,
  type WorkerEmailEnv,
} from "./worker-email";

export type ShortNoticeEnv = DriverAuthEnv &
  WorkerEmailEnv & {
    TRACKING_STORE: KVNamespace;
    SUMUP_API_KEY?: string;
    SUMUP_MERCHANT_CODE?: string;
  };

const WHATSAPP_DIGITS = "447549815538";

function formatAmountLabel(amount: number): string {
  return `£${(Math.round(amount * 100) / 100).toFixed(2)}`;
}

function buildCustomerWhatsAppUrl(reference: string): string {
  const text = encodeURIComponent(
    `Hi, I've submitted a booking with My Airport Taxi NI that needs availability confirmation. My booking reference is ${reference}. Can you confirm availability please?`,
  );
  return `https://wa.me/${WHATSAPP_DIGITS}?text=${text}`;
}

function buildOwnerWhatsAppPayUrl(record: ShortNoticeBookingRecord, payUrl: string): string {
  const text = encodeURIComponent(
    `Hi ${record.booking.customerName}, your short-notice booking ${record.reference} is approved. Please pay securely here: ${payUrl}`,
  );
  const mobile = record.booking.mobileNumber.replace(/\D/g, "").replace(/^0/, "44");
  return mobile ? `https://wa.me/${mobile}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function buildShortNoticePayUrl(siteOrigin: string, paymentToken: string): string {
  return `${siteOrigin.replace(/\/$/, "")}/pay/short-notice/?token=${encodeURIComponent(paymentToken)}`;
}

export function buildShortNoticeAcceptUrl(siteOrigin: string, acceptToken: string): string {
  return `${siteOrigin.replace(/\/$/, "")}/accept-alternative-time/?token=${encodeURIComponent(acceptToken)}`;
}

/**
 * Resolve the public website origin for customer email links.
 * Prefer the Owner/customer browser origin (Vercel preview or production) so
 * preview-generated emails do not 404 on production before the route is live.
 */
export function isAllowedShortNoticeSiteOrigin(origin: string): boolean {
  try {
    const url = new URL(origin.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "www.myairporttaxini.co.uk" || host === "myairporttaxini.co.uk") {
      return true;
    }
    // Project Vercel previews (and localhost for local Owner testing)
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (host.endsWith(".vercel.app") && host.includes("my-airport-taxi-ni-quote")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function resolveShortNoticeSiteOrigin(
  request: Request,
  body?: Record<string, unknown>,
  fallback = "https://www.myairporttaxini.co.uk",
): string {
  const fromBody = typeof body?.siteOrigin === "string" ? body.siteOrigin.trim() : "";
  const fromOrigin = (request.headers.get("Origin") || "").trim();
  let fromReferer = "";
  const referer = (request.headers.get("Referer") || "").trim();
  if (referer) {
    try {
      fromReferer = new URL(referer).origin;
    } catch {
      fromReferer = "";
    }
  }

  for (const candidate of [fromBody, fromOrigin, fromReferer]) {
    const cleaned = candidate.replace(/\/$/, "");
    if (cleaned && isAllowedShortNoticeSiteOrigin(cleaned)) {
      return cleaned;
    }
  }
  return fallback.replace(/\/$/, "");
}

function isValidTripDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function isValidTripTime(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value.trim());
}

function parseOfferSchedule(
  body: Record<string, unknown>,
): { offeredDate: string; offeredTime: string; note: string } | { error: string } {
  const offeredDate = String(body.offeredDate ?? body.tripDate ?? "").trim();
  const offeredTime = String(body.offeredTime ?? body.tripTime ?? "").trim();
  const note = String(body.ownerNote ?? body.note ?? "").trim().slice(0, 500);
  if (!isValidTripDate(offeredDate) || !isValidTripTime(offeredTime)) {
    return { error: "Enter a valid alternative date (YYYY-MM-DD) and time (HH:mm)." };
  }
  const when = parseLondonLocalDateTime(offeredDate, offeredTime);
  if (!when || when.getTime() <= Date.now()) {
    return { error: "Alternative pickup must be a future date and time." };
  }
  return { offeredDate, offeredTime, note };
}

/**
 * Auto-send eligibility: approved, unpaid, not cancelled/refunded/expired,
 * valid email, and not already emailed for this exact pay URL.
 * Owner Dashboard reload / list must never call this — only approve (and
 * intentional resend, which bypasses the sent-at guard).
 */
export function shouldAutoSendPaymentLinkEmail(
  record: ShortNoticeBookingRecord,
  payUrl: string,
  now = new Date(),
): boolean {
  if (
    record.status === "SHORT_NOTICE_DECLINED" ||
    record.status === "SHORT_NOTICE_EXPIRED" ||
    record.status === "SHORT_NOTICE_PAID" ||
    record.status === "SHORT_NOTICE_AWAITING_APPROVAL" ||
    record.status === "SHORT_NOTICE_ALTERNATIVE_OFFERED"
  ) {
    return false;
  }
  if (record.status !== "SHORT_NOTICE_APPROVED") return false;
  if (!isShortNoticePayable(record, now)) return false;
  if (record.paymentReference || record.paidAt) return false;
  if (!isValidCustomerEmail(record.booking.customerEmail)) return false;
  if (!payUrl.trim()) return false;
  const sentFor = record.paymentLinkEmailPayUrl?.trim() ?? "";
  if (record.paymentLinkEmailSentAt && sentFor === payUrl.trim()) {
    return false;
  }
  return true;
}

async function sendPaymentLinkEmail(
  env: ShortNoticeEnv,
  record: ShortNoticeBookingRecord,
  payUrl: string,
): Promise<{ sent: boolean; error?: string }> {
  if (!isValidCustomerEmail(record.booking.customerEmail)) {
    return { sent: false, error: "Customer email is missing or invalid." };
  }
  const email = buildShortNoticePaymentLinkEmail({
    customerName: record.booking.customerName,
    customerEmail: record.booking.customerEmail.trim(),
    pickupLabel: record.booking.pickupLabel,
    dropoffLabel: record.booking.dropoffLabel,
    tripDate: record.booking.tripDate,
    tripTime: record.booking.tripTime,
    amountLabel: formatAmountLabel(record.approvedAmount ?? record.amount),
    reference: record.reference,
    payUrl,
  });
  const result = await trySendBrandedCustomerEmail(env, {
    to: record.booking.customerEmail.trim(),
    toName: record.booking.customerName,
    subject: email.subject,
    body: email.text,
    htmlBody: email.html,
  });
  return { sent: result.sent, error: result.error };
}

async function sendAlternativeOfferEmail(
  env: ShortNoticeEnv,
  record: ShortNoticeBookingRecord,
  acceptUrl: string,
): Promise<{ sent: boolean; error?: string }> {
  if (!isValidCustomerEmail(record.booking.customerEmail)) {
    return { sent: false, error: "Customer email is missing or invalid." };
  }
  const originalDate = record.originalRequestedDate ?? record.booking.tripDate;
  const originalTime = record.originalRequestedTime ?? record.booking.tripTime;
  const email = buildShortNoticeAlternativeOfferEmail({
    customerName: record.booking.customerName,
    customerEmail: record.booking.customerEmail.trim(),
    pickupLabel: record.booking.pickupLabel,
    dropoffLabel: record.booking.dropoffLabel,
    originalDate,
    originalTime,
    offeredDate: record.offeredDate ?? "",
    offeredTime: record.offeredTime ?? "",
    amountLabel: formatAmountLabel(record.amount),
    reference: record.reference,
    acceptUrl,
    ...(record.offeredNote ? { ownerNote: record.offeredNote } : {}),
  });
  const result = await trySendBrandedCustomerEmail(env, {
    to: record.booking.customerEmail.trim(),
    toName: record.booking.customerName,
    subject: email.subject,
    body: email.text,
    htmlBody: email.html,
  });
  return { sent: result.sent, error: result.error };
}

/**
 * Promote a short-notice booking to APPROVED and optionally auto-send the
 * payment-link email. Shared by Owner “Approve requested time” and customer
 * accept-alternative. Never creates SumUp checkout.
 */
async function approveShortNoticeRecord(
  env: ShortNoticeEnv,
  existing: ShortNoticeBookingRecord,
  siteOrigin: string,
  now: Date,
  extras: Partial<ShortNoticeBookingRecord> = {},
): Promise<
  | {
      ok: true;
      record: ShortNoticeBookingRecord;
      payUrl: string;
      whatsappPayUrl: string;
      paymentEmailSent: boolean;
      paymentEmailError?: string;
    }
  | { error: string; status: number }
> {
  if (
    existing.status === "SHORT_NOTICE_DECLINED" ||
    existing.status === "SHORT_NOTICE_ALTERNATIVE_DECLINED"
  ) {
    return { error: "This request was declined and cannot be approved.", status: 409 };
  }
  if (existing.status === "SHORT_NOTICE_PAID") {
    return { error: "This booking has already been paid and confirmed.", status: 409 };
  }

  const approvedAt = now.toISOString();
  const approvedAmount = existing.amount;
  const booking = extras.booking ?? existing.booking;
  const materialFingerprint =
    extras.materialFingerprint ??
    materialJourneyFingerprint({
      ...booking,
      amount: approvedAmount,
    });

  // When approving as-requested, fingerprint must still match create-time lock.
  if (!extras.booking && materialFingerprint !== existing.materialFingerprint) {
    return {
      error: "Journey details changed since submission — customer must re-submit.",
      status: 409,
    };
  }

  const paymentExpiresAt = computeShortNoticePaymentExpiryIso({
    tripDate: booking.tripDate,
    tripTime: booking.tripTime,
    approvedAtIso: approvedAt,
    now,
  });
  if (new Date(paymentExpiresAt).getTime() <= now.getTime()) {
    const expired: ShortNoticeBookingRecord = {
      ...existing,
      ...extras,
      booking,
      materialFingerprint,
      status: "SHORT_NOTICE_EXPIRED",
      updatedAt: approvedAt,
      paymentExpiresAt,
    };
    await saveShortNoticeBooking(env.TRACKING_STORE, expired);
    return { error: "Pickup time has passed — cannot approve for payment.", status: 409 };
  }

  const record: ShortNoticeBookingRecord = {
    ...existing,
    ...extras,
    booking,
    materialFingerprint,
    status: "SHORT_NOTICE_APPROVED",
    approvedAt: existing.approvedAt ?? approvedAt,
    approvedBy: "Owner",
    approvedAmount,
    approvedFingerprint: materialFingerprint,
    paymentExpiresAt,
    updatedAt: approvedAt,
  };

  const payUrl = buildShortNoticePayUrl(siteOrigin, record.paymentToken);
  let nextRecord = record;
  let paymentEmailSent = false;
  let paymentEmailError: string | undefined;

  if (shouldAutoSendPaymentLinkEmail(record, payUrl, now)) {
    const send = await sendPaymentLinkEmail(env, record, payUrl);
    paymentEmailSent = send.sent;
    paymentEmailError = send.error;
    if (send.sent) {
      nextRecord = {
        ...record,
        paymentLinkEmailSentAt: approvedAt,
        paymentLinkEmailPayUrl: payUrl,
        updatedAt: approvedAt,
      };
    }
  }

  await saveShortNoticeBooking(env.TRACKING_STORE, nextRecord);

  return {
    ok: true,
    record: nextRecord,
    payUrl,
    whatsappPayUrl: buildOwnerWhatsAppPayUrl(nextRecord, payUrl),
    paymentEmailSent,
    ...(paymentEmailError ? { paymentEmailError } : {}),
  };
}


export function publicShortNoticeSummary(record: ShortNoticeBookingRecord) {
  return {
    reference: record.reference,
    status: record.status,
    amount: record.approvedAmount ?? record.amount,
    amountLabel: formatAmountLabel(record.approvedAmount ?? record.amount),
    service: vehicleServiceLabel(record.booking.vehicle),
    vehicle: record.booking.vehicle,
    customerName: record.booking.customerName,
    pickupLabel: record.booking.pickupLabel,
    dropoffLabel: record.booking.dropoffLabel,
    tripDate: record.booking.tripDate,
    tripTime: record.booking.tripTime,
    returnJourney: record.booking.returnJourney,
    returnDate: record.booking.returnDate,
    returnTime: record.booking.returnTime,
    passengers: record.booking.passengers,
    suitcases: record.booking.suitcases,
    flightNumber: record.booking.flightNumber,
    paymentExpiresAt: record.paymentExpiresAt ?? null,
    payable: isShortNoticePayable(record),
  };
}

export async function createShortNoticeRequest(options: {
  store: KVNamespace;
  booking: PaidBookingDetails;
  amount: number;
  now?: Date;
  personalQuoteCode?: string;
  standardWebsiteAmount?: number;
}): Promise<{
  record: ShortNoticeBookingRecord;
  whatsappUrl: string;
}> {
  const now = options.now ?? new Date();
  const settings = await getBookingSettings(options.store);
  const blocking = findBlockingUnavailablePeriod(
    options.booking.tripDate,
    options.booking.tripTime,
    settings.unavailablePeriods,
    now,
  );

  if (!blocking) {
    throw new Error("Pickup is outside unavailable periods — use SumUp checkout.");
  }

  const amount = Math.round(options.amount * 100) / 100;
  const reference = generateShortNoticeReference(now);
  const paymentToken = generatePaymentToken();
  const fingerprint = materialJourneyFingerprint({
    ...options.booking,
    amount,
  });

  const record: ShortNoticeBookingRecord = {
    reference,
    paymentToken,
    status: "SHORT_NOTICE_AWAITING_APPROVAL",
    amount,
    currency: "GBP",
    amountLabel: formatAmountLabel(amount),
    booking: options.booking,
    materialFingerprint: fingerprint,
    unavailablePeriodIdApplied: blocking.id,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...(options.personalQuoteCode
      ? { personalQuoteCode: options.personalQuoteCode }
      : {}),
    ...(typeof options.standardWebsiteAmount === "number"
      ? { standardWebsiteAmount: options.standardWebsiteAmount }
      : {}),
  };

  await saveShortNoticeBooking(options.store, record);
  return { record, whatsappUrl: buildCustomerWhatsAppUrl(reference) };
}

/**
 * Re-check Owner unavailable periods immediately before SumUp checkout.
 * Read-only — expired periods are ignored without a KV write.
 */
export async function shouldForceShortNotice(
  store: KVNamespace,
  booking: PaidBookingDetails,
  now = new Date(),
): Promise<{
  shortNotice: boolean;
  gateActive: boolean;
  blockingPeriodId: string | null;
  blockingPeriodLabel: string | null;
}> {
  const settings = await getBookingSettings(store);
  const blocking = findBlockingUnavailablePeriod(
    booking.tripDate,
    booking.tripTime,
    settings.unavailablePeriods,
    now,
  );
  const activePeriods = listActiveUnavailablePeriods(settings.unavailablePeriods, now);
  return {
    shortNotice: Boolean(blocking),
    gateActive: activePeriods.length > 0,
    blockingPeriodId: blocking?.id ?? null,
    blockingPeriodLabel: blocking ? formatUnavailablePeriodRangeLabel(blocking) : null,
  };
}

export async function handleOwnerListShortNotice(
  request: Request,
  env: ShortNoticeEnv,
): Promise<{ ok: true; bookings: ShortNoticeBookingRecord[] } | { error: string; status: number }> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }
  const bookings = await listOpenShortNoticeBookings(env.TRACKING_STORE);
  return { ok: true, bookings };
}

export async function handleOwnerListArchivedShortNotice(
  request: Request,
  env: ShortNoticeEnv,
): Promise<
  { ok: true; bookings: ShortNoticeBookingRecord[] } | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }
  const bookings = await listArchivedShortNoticeBookings(env.TRACKING_STORE);
  return { ok: true, bookings };
}

/**
 * Owner soft-remove from active dashboard. Keeps booking/payment/audit record.
 * No refund, no SumUp change, no customer email.
 */
export async function handleOwnerRemoveFromDashboard(
  request: Request,
  env: ShortNoticeEnv,
  body: Record<string, unknown>,
): Promise<{ ok: true; record: ShortNoticeBookingRecord } | { error: string; status: number }> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }
  const reference = String(body.reference ?? "").trim();
  if (!reference) return { error: "Missing booking reference.", status: 400 };

  const existing = await getShortNoticeByReference(env.TRACKING_STORE, reference);
  if (!existing) return { error: "Short-notice booking not found.", status: 404 };

  if (existing.removedFromDashboardAt) {
    return { ok: true, record: existing };
  }

  const nowIso = new Date().toISOString();
  const record: ShortNoticeBookingRecord = {
    ...existing,
    removedFromDashboardAt: nowIso,
    removedFromDashboardBy: "Owner",
    updatedAt: nowIso,
  };
  await saveShortNoticeBooking(env.TRACKING_STORE, record);
  return { ok: true, record };
}

/**
 * Owner restore a soft-removed booking to the active dashboard when still open.
 * Declined / expired history stays archived (not permanently deleted).
 */
export async function handleOwnerRestoreToDashboard(
  request: Request,
  env: ShortNoticeEnv,
  body: Record<string, unknown>,
): Promise<{ ok: true; record: ShortNoticeBookingRecord } | { error: string; status: number }> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }
  const reference = String(body.reference ?? "").trim();
  if (!reference) return { error: "Missing booking reference.", status: 400 };

  const existing = await getShortNoticeByReference(env.TRACKING_STORE, reference);
  if (!existing) return { error: "Short-notice booking not found.", status: 404 };

  if (
    existing.status === "SHORT_NOTICE_DECLINED" ||
    existing.status === "SHORT_NOTICE_ALTERNATIVE_DECLINED" ||
    existing.status === "SHORT_NOTICE_EXPIRED" ||
    existing.status === "SHORT_NOTICE_PAID"
  ) {
    return {
      error:
        "This booking has a final status and stays in Archived / Removed for history. It cannot return to the active approval list.",
      status: 409,
    };
  }

  if (!existing.removedFromDashboardAt) {
    return { ok: true, record: existing };
  }

  const nowIso = new Date().toISOString();
  const record: ShortNoticeBookingRecord = {
    ...existing,
    removedFromDashboardAt: undefined,
    removedFromDashboardBy: undefined,
    restoredToDashboardAt: nowIso,
    updatedAt: nowIso,
  };
  await saveShortNoticeBooking(env.TRACKING_STORE, record);
  return { ok: true, record };
}

export async function handleOwnerApproveShortNotice(
  request: Request,
  env: ShortNoticeEnv,
  body: Record<string, unknown>,
  siteOrigin: string,
): Promise<
  | {
      ok: true;
      record: ShortNoticeBookingRecord;
      payUrl: string;
      whatsappPayUrl: string;
      paymentEmailSent: boolean;
      paymentEmailError?: string;
    }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }
  const reference = String(body.reference ?? "").trim();
  if (!reference) return { error: "Missing booking reference.", status: 400 };

  const existing = await getShortNoticeByReference(env.TRACKING_STORE, reference);
  if (!existing) return { error: "Short-notice booking not found.", status: 404 };
  if (existing.status === "SHORT_NOTICE_ALTERNATIVE_OFFERED") {
    return {
      error: "An alternative time is already offered — withdraw it first, or wait for the customer to accept.",
      status: 409,
    };
  }
  if (existing.status !== "SHORT_NOTICE_AWAITING_APPROVAL" && existing.status !== "SHORT_NOTICE_APPROVED") {
    if (existing.status === "SHORT_NOTICE_DECLINED") {
      return { error: "This request was declined and cannot be approved.", status: 409 };
    }
    if (existing.status === "SHORT_NOTICE_PAID") {
      return { error: "This booking is already paid.", status: 409 };
    }
    return { error: "Booking cannot be approved in its current status.", status: 409 };
  }

  return approveShortNoticeRecord(env, existing, siteOrigin, new Date());
}

/**
 * Owner: offer an alternative pickup date/time (email only — no payment / SumUp).
 * Also used for “Change offered time”.
 */
export async function handleOwnerOfferAlternativeTime(
  request: Request,
  env: ShortNoticeEnv,
  body: Record<string, unknown>,
  siteOrigin: string,
): Promise<
  | {
      ok: true;
      record: ShortNoticeBookingRecord;
      acceptUrl: string;
      alternativeEmailSent: boolean;
      alternativeEmailError?: string;
    }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }
  const reference = String(body.reference ?? "").trim();
  if (!reference) return { error: "Missing booking reference.", status: 400 };

  const schedule = parseOfferSchedule(body);
  if ("error" in schedule) return { error: schedule.error, status: 400 };

  const existing = await getShortNoticeByReference(env.TRACKING_STORE, reference);
  if (!existing) return { error: "Short-notice booking not found.", status: 404 };
  if (existing.status === "SHORT_NOTICE_PAID") {
    return { error: "Booking is already paid.", status: 409 };
  }
  if (
    existing.status === "SHORT_NOTICE_DECLINED" ||
    existing.status === "SHORT_NOTICE_ALTERNATIVE_DECLINED" ||
    existing.status === "SHORT_NOTICE_EXPIRED"
  ) {
    return { error: "Booking is no longer open.", status: 409 };
  }
  if (existing.status === "SHORT_NOTICE_APPROVED") {
    return { error: "Booking is already approved for payment.", status: 409 };
  }
  if (
    existing.status !== "SHORT_NOTICE_AWAITING_APPROVAL" &&
    existing.status !== "SHORT_NOTICE_ALTERNATIVE_OFFERED"
  ) {
    return { error: "Booking cannot receive an alternative-time offer.", status: 409 };
  }

  // Same pickup as already requested — use Approve requested time instead.
  if (
    schedule.offeredDate === existing.booking.tripDate &&
    schedule.offeredTime === existing.booking.tripTime &&
    existing.status === "SHORT_NOTICE_AWAITING_APPROVAL"
  ) {
    return {
      error: "That is the originally requested time — use Approve requested time instead.",
      status: 400,
    };
  }

  const nowIso = new Date().toISOString();
  const acceptToken = generatePaymentToken();
  const originalRequestedDate =
    existing.originalRequestedDate ?? existing.booking.tripDate;
  const originalRequestedTime =
    existing.originalRequestedTime ?? existing.booking.tripTime;

  // Preserve quoted amount — do not recalculate fare for weekend/Bank Holiday.
  const record: ShortNoticeBookingRecord = {
    ...existing,
    status: "SHORT_NOTICE_ALTERNATIVE_OFFERED",
    originalRequestedDate,
    originalRequestedTime,
    offeredDate: schedule.offeredDate,
    offeredTime: schedule.offeredTime,
    offeredAt: nowIso,
    offeredBy: "Owner",
    offeredNote: schedule.note || undefined,
    acceptToken,
    updatedAt: nowIso,
  };

  const acceptUrl = buildShortNoticeAcceptUrl(siteOrigin, acceptToken);
  const send = await sendAlternativeOfferEmail(env, record, acceptUrl);
  const nextRecord: ShortNoticeBookingRecord = send.sent
    ? {
        ...record,
        alternativeTimeEmailSentAt: nowIso,
        alternativeTimeEmailAcceptUrl: acceptUrl,
        updatedAt: nowIso,
      }
    : record;

  await saveShortNoticeBooking(env.TRACKING_STORE, nextRecord);

  return {
    ok: true,
    record: nextRecord,
    acceptUrl,
    alternativeEmailSent: send.sent,
    ...(send.error ? { alternativeEmailError: send.error } : {}),
  };
}

/** Owner: resend the current alternative-time offer email (no SumUp). */
export async function handleOwnerResendAlternativeEmail(
  request: Request,
  env: ShortNoticeEnv,
  body: Record<string, unknown>,
  siteOrigin: string,
): Promise<
  | {
      ok: true;
      record: ShortNoticeBookingRecord;
      acceptUrl: string;
      alternativeEmailSent: true;
    }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }
  const reference = String(body.reference ?? "").trim();
  if (!reference) return { error: "Missing booking reference.", status: 400 };

  const existing = await getShortNoticeByReference(env.TRACKING_STORE, reference);
  if (!existing) return { error: "Short-notice booking not found.", status: 404 };
  if (existing.status !== "SHORT_NOTICE_ALTERNATIVE_OFFERED") {
    return { error: "No alternative-time offer is pending for this booking.", status: 409 };
  }
  if (!existing.acceptToken || !existing.offeredDate || !existing.offeredTime) {
    return { error: "Alternative-time offer is incomplete.", status: 409 };
  }
  if (!isValidCustomerEmail(existing.booking.customerEmail)) {
    return { error: "Customer email is missing or invalid.", status: 400 };
  }

  const acceptUrl = buildShortNoticeAcceptUrl(siteOrigin, existing.acceptToken);
  const send = await sendAlternativeOfferEmail(env, existing, acceptUrl);
  if (!send.sent) {
    return { error: send.error || "Could not send alternative-time email.", status: 502 };
  }

  const nowIso = new Date().toISOString();
  const record: ShortNoticeBookingRecord = {
    ...existing,
    alternativeTimeEmailSentAt: nowIso,
    alternativeTimeEmailAcceptUrl: acceptUrl,
    updatedAt: nowIso,
  };
  await saveShortNoticeBooking(env.TRACKING_STORE, record);
  return { ok: true, record, acceptUrl, alternativeEmailSent: true };
}

/** Owner: withdraw alternative offer → back to awaiting approval. */
export async function handleOwnerWithdrawAlternativeOffer(
  request: Request,
  env: ShortNoticeEnv,
  body: Record<string, unknown>,
): Promise<{ ok: true; record: ShortNoticeBookingRecord } | { error: string; status: number }> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }
  const reference = String(body.reference ?? "").trim();
  if (!reference) return { error: "Missing booking reference.", status: 400 };

  const existing = await getShortNoticeByReference(env.TRACKING_STORE, reference);
  if (!existing) return { error: "Short-notice booking not found.", status: 404 };
  if (existing.status !== "SHORT_NOTICE_ALTERNATIVE_OFFERED") {
    return { error: "No alternative-time offer to withdraw.", status: 409 };
  }

  const nowIso = new Date().toISOString();
  const record: ShortNoticeBookingRecord = {
    ...existing,
    status: "SHORT_NOTICE_AWAITING_APPROVAL",
    offeredDate: undefined,
    offeredTime: undefined,
    offeredAt: undefined,
    offeredBy: undefined,
    offeredNote: undefined,
    acceptToken: undefined,
    alternativeTimeEmailSentAt: undefined,
    alternativeTimeEmailAcceptUrl: undefined,
    updatedAt: nowIso,
  };
  await saveShortNoticeBooking(env.TRACKING_STORE, record);
  return { ok: true, record };
}

/**
 * Public: customer accepts the offered alternative pickup time.
 * Idempotent — repeated clicks do not create a second booking/payment/SumUp.
 * Optional customer note never blocks acceptance.
 */
export async function handlePublicAcceptAlternativeTime(
  request: Request,
  env: ShortNoticeEnv,
  body: Record<string, unknown>,
  siteOrigin: string,
): Promise<
  | {
      ok: true;
      record: ShortNoticeBookingRecord;
      payUrl: string;
      whatsappPayUrl: string;
      paymentEmailSent: boolean;
      alreadyAccepted?: boolean;
      paymentEmailError?: string;
    }
  | { error: string; status: number }
> {
  const token = String(body.token ?? body.acceptToken ?? "").trim();
  if (!token) return { error: "Missing acceptance token.", status: 400 };

  const customerNote = sanitizeCustomerResponseNote(
    body.customerNote ?? body.note ?? body.message,
  );

  const existing = await getShortNoticeByAcceptToken(env.TRACKING_STORE, token);
  if (!existing) {
    return {
      error:
        "This acceptance link is no longer valid. The offer may have been withdrawn or replaced — contact us on WhatsApp if you still need a pickup.",
      status: 410,
    };
  }

  // Idempotent: already approved after accepting this offer.
  if (existing.status === "SHORT_NOTICE_APPROVED" && existing.acceptedAlternativeAt) {
    const payUrl = buildShortNoticePayUrl(siteOrigin, existing.paymentToken);
    return {
      ok: true,
      record: existing,
      payUrl,
      whatsappPayUrl: buildOwnerWhatsAppPayUrl(existing, payUrl),
      paymentEmailSent: Boolean(existing.paymentLinkEmailSentAt),
      alreadyAccepted: true,
    };
  }

  if (existing.status === "SHORT_NOTICE_PAID") {
    return {
      error: "This booking has already been paid and confirmed.",
      status: 409,
    };
  }
  if (
    existing.status === "SHORT_NOTICE_DECLINED" ||
    existing.status === "SHORT_NOTICE_ALTERNATIVE_DECLINED"
  ) {
    return {
      error: "This alternative pickup time was declined and cannot be accepted.",
      status: 409,
    };
  }
  if (existing.status === "SHORT_NOTICE_AWAITING_APPROVAL") {
    return {
      error:
        "This alternative-time offer was withdrawn. Please wait for a new update from My Airport Taxi NI.",
      status: 409,
    };
  }
  if (existing.status !== "SHORT_NOTICE_ALTERNATIVE_OFFERED") {
    return { error: "This alternative-time offer is no longer available.", status: 409 };
  }
  if (!existing.offeredDate || !existing.offeredTime) {
    return { error: "Alternative pickup time is missing.", status: 409 };
  }
  if (existing.acceptToken !== token) {
    return { error: "This acceptance link is no longer valid.", status: 409 };
  }

  const now = new Date();
  const acceptedAt = now.toISOString();
  const originalRequestedDate =
    existing.originalRequestedDate ?? existing.booking.tripDate;
  const originalRequestedTime =
    existing.originalRequestedTime ?? existing.booking.tripTime;

  // Apply offered schedule; keep amount unchanged (no weekend/BH surcharge).
  const booking = {
    ...existing.booking,
    tripDate: existing.offeredDate,
    tripTime: existing.offeredTime,
  };
  const materialFingerprint = materialJourneyFingerprint({
    ...booking,
    amount: existing.amount,
  });

  return approveShortNoticeRecord(env, existing, siteOrigin, now, {
    booking,
    materialFingerprint,
    originalRequestedDate,
    originalRequestedTime,
    acceptedAlternativeAt: acceptedAt,
    customerResponse: "accepted",
    customerResponseAt: acceptedAt,
    ...(customerNote ? { customerResponseNote: customerNote } : {}),
  });
}

/**
 * Public: customer declines the offered alternative pickup time.
 * Idempotent — no SumUp, no payment email, removed from active Owner list, record retained.
 */
export async function handlePublicDeclineAlternativeTime(
  request: Request,
  env: ShortNoticeEnv,
  body: Record<string, unknown>,
): Promise<
  | {
      ok: true;
      record: ShortNoticeBookingRecord;
      alreadyDeclined?: boolean;
    }
  | { error: string; status: number }
> {
  const token = String(body.token ?? body.acceptToken ?? "").trim();
  if (!token) return { error: "Missing response token.", status: 400 };

  const customerNote = sanitizeCustomerResponseNote(
    body.customerNote ?? body.note ?? body.message,
  );

  const existing = await getShortNoticeByAcceptToken(env.TRACKING_STORE, token);
  if (!existing) {
    return {
      error:
        "This link is no longer valid. The offer may have been withdrawn or replaced — contact us on WhatsApp if you still need a pickup.",
      status: 410,
    };
  }

  if (
    existing.status === "SHORT_NOTICE_ALTERNATIVE_DECLINED" &&
    existing.declinedAlternativeAt
  ) {
    return { ok: true, record: existing, alreadyDeclined: true };
  }

  if (existing.status === "SHORT_NOTICE_PAID") {
    return {
      error: "This booking has already been paid and confirmed.",
      status: 409,
    };
  }
  if (existing.status === "SHORT_NOTICE_APPROVED" && existing.acceptedAlternativeAt) {
    return {
      error: "This alternative pickup time was already accepted.",
      status: 409,
    };
  }
  if (existing.status === "SHORT_NOTICE_DECLINED") {
    return { error: "This booking request was already declined.", status: 409 };
  }
  if (existing.status === "SHORT_NOTICE_AWAITING_APPROVAL") {
    return {
      error:
        "This alternative-time offer was withdrawn. Please wait for a new update from My Airport Taxi NI.",
      status: 409,
    };
  }
  if (existing.status !== "SHORT_NOTICE_ALTERNATIVE_OFFERED") {
    return { error: "This alternative-time offer is no longer available.", status: 409 };
  }
  if (existing.acceptToken !== token) {
    return { error: "This link is no longer valid.", status: 409 };
  }

  const nowIso = new Date().toISOString();
  const record: ShortNoticeBookingRecord = {
    ...existing,
    status: "SHORT_NOTICE_ALTERNATIVE_DECLINED",
    customerResponse: "declined",
    customerResponseAt: nowIso,
    declinedAlternativeAt: nowIso,
    ...(customerNote ? { customerResponseNote: customerNote } : {}),
    updatedAt: nowIso,
  };
  await saveShortNoticeBooking(env.TRACKING_STORE, record);
  return { ok: true, record };
}

/** Public GET summary for the alternative-time response page (read-only). */
export function publicAlternativeOfferSummary(record: ShortNoticeBookingRecord) {
  return {
    reference: record.reference,
    status: record.status,
    amount: record.amount,
    amountLabel: formatAmountLabel(record.amount),
    service: vehicleServiceLabel(record.booking.vehicle),
    vehicle: record.booking.vehicle,
    customerName: record.booking.customerName,
    pickupLabel: record.booking.pickupLabel,
    dropoffLabel: record.booking.dropoffLabel,
    requestedDate: record.originalRequestedDate ?? record.booking.tripDate,
    requestedTime: record.originalRequestedTime ?? record.booking.tripTime,
    offeredDate: record.offeredDate ?? null,
    offeredTime: record.offeredTime ?? null,
    offeredNote: record.offeredNote ?? null,
    customerResponseNote: record.customerResponseNote ?? null,
    passengers: record.booking.passengers,
    suitcases: record.booking.suitcases,
    flightNumber: record.booking.flightNumber,
    acceptPending: record.status === "SHORT_NOTICE_ALTERNATIVE_OFFERED",
    alreadyAccepted: Boolean(
      (record.status === "SHORT_NOTICE_APPROVED" || record.status === "SHORT_NOTICE_PAID") &&
        record.acceptedAlternativeAt,
    ),
    alreadyDeclined: Boolean(
      record.status === "SHORT_NOTICE_ALTERNATIVE_DECLINED" && record.declinedAlternativeAt,
    ),
    alreadyPaid: record.status === "SHORT_NOTICE_PAID",
  };
}

/**
 * Owner-only: intentionally resend the existing secure payment-link email.
 * Does not create a new booking, payment, amount change, or SumUp checkout.
 */
export async function handleOwnerResendPaymentEmail(
  request: Request,
  env: ShortNoticeEnv,
  body: Record<string, unknown>,
  siteOrigin: string,
): Promise<
  | {
      ok: true;
      record: ShortNoticeBookingRecord;
      payUrl: string;
      paymentEmailSent: true;
    }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }
  const reference = String(body.reference ?? "").trim();
  if (!reference) return { error: "Missing booking reference.", status: 400 };

  const existing = await getShortNoticeByReference(env.TRACKING_STORE, reference);
  if (!existing) return { error: "Short-notice booking not found.", status: 404 };

  if (existing.status === "SHORT_NOTICE_PAID" || existing.paymentReference || existing.paidAt) {
    return { error: "Booking is already paid.", status: 409 };
  }
  if (
    existing.status === "SHORT_NOTICE_DECLINED" ||
    existing.status === "SHORT_NOTICE_EXPIRED"
  ) {
    return { error: "Booking is no longer awaiting payment.", status: 409 };
  }
  if (existing.status !== "SHORT_NOTICE_APPROVED") {
    return { error: "Booking must be approved and awaiting payment first.", status: 409 };
  }
  if (!existing.paymentToken) {
    return { error: "Secure payment link is not available yet.", status: 409 };
  }
  if (!isValidCustomerEmail(existing.booking.customerEmail)) {
    return { error: "Customer email is missing or invalid.", status: 400 };
  }

  const now = new Date();
  if (!isShortNoticePayable(existing, now)) {
    return { error: "This payment link has expired.", status: 409 };
  }

  const payUrl = buildShortNoticePayUrl(siteOrigin, existing.paymentToken);
  const send = await sendPaymentLinkEmail(env, existing, payUrl);
  if (!send.sent) {
    return { error: send.error || "Could not send payment email.", status: 502 };
  }

  const sentAt = now.toISOString();
  const record: ShortNoticeBookingRecord = {
    ...existing,
    paymentLinkEmailSentAt: sentAt,
    paymentLinkEmailPayUrl: payUrl,
    updatedAt: sentAt,
  };
  await saveShortNoticeBooking(env.TRACKING_STORE, record);

  return {
    ok: true,
    record,
    payUrl,
    paymentEmailSent: true,
  };
}

export async function handleOwnerDeclineShortNotice(
  request: Request,
  env: ShortNoticeEnv,
  body: Record<string, unknown>,
): Promise<{ ok: true; record: ShortNoticeBookingRecord } | { error: string; status: number }> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }
  const reference = String(body.reference ?? "").trim();
  if (!reference) return { error: "Missing booking reference.", status: 400 };
  const existing = await getShortNoticeByReference(env.TRACKING_STORE, reference);
  if (!existing) return { error: "Short-notice booking not found.", status: 404 };
  if (existing.status === "SHORT_NOTICE_PAID") {
    return { error: "Already paid — cannot decline.", status: 409 };
  }
  if (
    existing.status !== "SHORT_NOTICE_AWAITING_APPROVAL" &&
    existing.status !== "SHORT_NOTICE_ALTERNATIVE_OFFERED" &&
    existing.status !== "SHORT_NOTICE_APPROVED"
  ) {
    return { error: "Booking cannot be declined in its current status.", status: 409 };
  }

  const nowIso = new Date().toISOString();
  const record: ShortNoticeBookingRecord = {
    ...existing,
    status: "SHORT_NOTICE_DECLINED",
    declinedAt: nowIso,
    declineReason: String(body.reason ?? "").trim() || undefined,
    updatedAt: nowIso,
    paymentExpiresAt: nowIso,
  };
  await saveShortNoticeBooking(env.TRACKING_STORE, record);
  return { ok: true, record };
}

export async function resolveShortNoticeForPayment(
  store: KVNamespace,
  token: string,
  now = new Date(),
): Promise<{ ok: true; record: ShortNoticeBookingRecord } | { error: string; status: number }> {
  const record = await getShortNoticeByToken(store, token);
  if (!record) return { error: "Payment link not found.", status: 404 };

  if (record.status === "SHORT_NOTICE_DECLINED") {
    return { error: "This booking request was declined.", status: 409 };
  }
  if (record.status === "SHORT_NOTICE_ALTERNATIVE_DECLINED") {
    return { error: "This alternative pickup time was declined.", status: 409 };
  }
  if (record.status === "SHORT_NOTICE_PAID") {
    return { error: "This booking has already been paid and confirmed.", status: 409 };
  }
  if (record.status === "SHORT_NOTICE_AWAITING_APPROVAL") {
    return { error: "This booking is still awaiting Owner approval.", status: 409 };
  }
  if (record.status === "SHORT_NOTICE_ALTERNATIVE_OFFERED") {
    return {
      error: "This booking is awaiting customer acceptance of an alternative pickup time.",
      status: 409,
    };
  }
  if (record.status === "SHORT_NOTICE_EXPIRED" || !isShortNoticePayable(record, now)) {
    if (record.status === "SHORT_NOTICE_APPROVED") {
      const expired: ShortNoticeBookingRecord = {
        ...record,
        status: "SHORT_NOTICE_EXPIRED",
        updatedAt: now.toISOString(),
      };
      await saveShortNoticeBooking(store, expired);
    }
    return { error: "This payment link has expired.", status: 409 };
  }

  const fingerprint = materialJourneyFingerprint({
    ...record.booking,
    amount: record.approvedAmount ?? record.amount,
  });
  if (record.approvedFingerprint && fingerprint !== record.approvedFingerprint) {
    return {
      error: "Booking details no longer match the approved fare — contact us on WhatsApp.",
      status: 409,
    };
  }

  return { ok: true, record };
}

export async function markShortNoticePaid(
  store: KVNamespace,
  token: string,
  paymentReference: string,
  checkoutId: string,
): Promise<ShortNoticeBookingRecord | null> {
  const record = await getShortNoticeByToken(store, token);
  if (!record) return null;
  const nowIso = new Date().toISOString();
  const paid: ShortNoticeBookingRecord = {
    ...record,
    status: "SHORT_NOTICE_PAID",
    paymentReference,
    checkoutId,
    paidAt: nowIso,
    updatedAt: nowIso,
  };
  await saveShortNoticeBooking(store, paid);
  return paid;
}

export async function handleOwnerGetBookingSettings(
  request: Request,
  env: ShortNoticeEnv,
): Promise<
  | {
      ok: true;
      settings: ReturnType<typeof bookingSettingsPublicView>;
    }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }
  const settings = await getBookingSettings(env.TRACKING_STORE);
  return { ok: true, settings: bookingSettingsPublicView(settings) };
}

export async function handleOwnerSaveBookingSettings(
  request: Request,
  env: ShortNoticeEnv,
  body: Record<string, unknown>,
): Promise<
  | {
      ok: true;
      settings: ReturnType<typeof bookingSettingsPublicView>;
      period?: { id: string; startLocal: string; endLocal: string; note?: string };
    }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }

  const action = String(body.action ?? "add").trim().toLowerCase();

  try {
    if (action === "delete") {
      const id = String(body.id ?? "").trim();
      const settings = await deleteUnavailablePeriod(env.TRACKING_STORE, id);
      return { ok: true, settings: bookingSettingsPublicView(settings) };
    }

    const startLocal =
      typeof body.startLocal === "string"
        ? body.startLocal
        : typeof body.startDate === "string" && typeof body.startTime === "string"
          ? `${body.startDate.trim()}T${body.startTime.trim()}`
          : "";
    const endLocal =
      typeof body.endLocal === "string"
        ? body.endLocal
        : typeof body.endDate === "string" && typeof body.endTime === "string"
          ? `${body.endDate.trim()}T${body.endTime.trim()}`
          : "";
    const note = typeof body.note === "string" ? body.note : "";

    if (action === "update") {
      const id = String(body.id ?? "").trim();
      const { settings, period } = await updateUnavailablePeriod(env.TRACKING_STORE, id, {
        id,
        startLocal,
        endLocal,
        note,
      });
      return {
        ok: true,
        settings: bookingSettingsPublicView(settings),
        period: {
          id: period.id,
          startLocal: period.startLocal,
          endLocal: period.endLocal,
          ...(period.note ? { note: period.note } : {}),
        },
      };
    }

    // default: add
    const { settings, period } = await addUnavailablePeriod(env.TRACKING_STORE, {
      startLocal,
      endLocal,
      note,
    });
    return {
      ok: true,
      settings: bookingSettingsPublicView(settings),
      period: {
        id: period.id,
        startLocal: period.startLocal,
        endLocal: period.endLocal,
        ...(period.note ? { note: period.note } : {}),
      },
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not update unavailable periods",
      status: 400,
    };
  }
}

export { getShortNoticeByToken, getBookingSettings };

export function isOwnerShortNoticePath(pathname: string): boolean {
  return (
    pathname === "/owner/short-notice" ||
    pathname === "/api/owner/short-notice" ||
    pathname === "/owner/short-notice/archived" ||
    pathname === "/api/owner/short-notice/archived" ||
    pathname === "/owner/short-notice/approve" ||
    pathname === "/api/owner/short-notice/approve" ||
    pathname === "/owner/short-notice/decline" ||
    pathname === "/api/owner/short-notice/decline" ||
    pathname === "/owner/short-notice/remove-from-dashboard" ||
    pathname === "/api/owner/short-notice/remove-from-dashboard" ||
    pathname === "/owner/short-notice/restore-to-dashboard" ||
    pathname === "/api/owner/short-notice/restore-to-dashboard" ||
    pathname === "/owner/short-notice/resend-payment-email" ||
    pathname === "/api/owner/short-notice/resend-payment-email" ||
    pathname === "/owner/short-notice/offer-alternative" ||
    pathname === "/api/owner/short-notice/offer-alternative" ||
    pathname === "/owner/short-notice/resend-alternative-email" ||
    pathname === "/api/owner/short-notice/resend-alternative-email" ||
    pathname === "/owner/short-notice/withdraw-alternative" ||
    pathname === "/api/owner/short-notice/withdraw-alternative"
  );
}

export function isOwnerBookingSettingsPath(pathname: string): boolean {
  return (
    pathname === "/owner/booking-settings" || pathname === "/api/owner/booking-settings"
  );
}

export function isPublicShortNoticePath(pathname: string): boolean {
  return (
    pathname === "/short-notice" ||
    pathname === "/api/short-notice" ||
    pathname === "/payments/short-notice" ||
    pathname === "/api/payments/short-notice" ||
    pathname === "/short-notice/accept-alternative" ||
    pathname === "/api/short-notice/accept-alternative" ||
    pathname === "/short-notice/decline-alternative" ||
    pathname === "/api/short-notice/decline-alternative" ||
    pathname === "/short-notice/alternative-offer" ||
    pathname === "/api/short-notice/alternative-offer"
  );
}
