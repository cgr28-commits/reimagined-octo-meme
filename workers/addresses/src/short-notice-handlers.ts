/**
 * Short-notice booking: create / list / approve / decline / pay-via-SumUp.
 */

import type { PaidBookingDetails } from "../shared/booking-notifications";
import {
  DEFAULT_DEPOSIT_MINIMUM_GBP,
  DEFAULT_DEPOSIT_PERCENT,
} from "../shared/deposit-cash";
import {
  MINIMUM_BOOKING_NOTICE_HOURS,
  MINIMUM_SHORT_NOTICE_LEAD_HOURS,
  SHORT_NOTICE_CONFIRMATION_WINDOW_HOURS,
  OwnerNoAvailabilityError,
  PickupTooSoonError,
  computeShortNoticePaymentExpiryIso,
  customerPaymentLinkExpiredMessage,
  evaluateOwnerNoAvailability,
  findConflictingNoAvailabilityPeriod,
  findRequestOnlyBlockingPeriod,
  formatUnavailablePeriodRangeLabel,
  isBelowMinimumShortNoticeLead,
  isWithinMinimumBookingNotice,
  listActiveUnavailablePeriods,
  materialJourneyFingerprint,
  normalizeUnavailablePeriodMode,
  type OwnerAvailabilityBooking,
  type PublicOwnerAvailability,
  type UnavailablePeriod,
  vehicleServiceLabel,
} from "../shared/booking-notice";
import {
  appendShortNoticeHistory,
  isShortNoticePayable,
  isShortNoticeResponseExpiredRecord,
  isShortNoticeResponseWindowDue,
  shortNoticeVerifiedCheckoutDecision,
  sanitizeCustomerResponseNote,
  SHORT_NOTICE_RESPONSE_EXPIRED_ADMIN_MESSAGE,
  SHORT_NOTICE_RESPONSE_EXPIRED_CUSTOMER_MESSAGE,
  shortNoticeExpiryEmailKey,
  shortNoticeResponseExpiresAtIso,
  type ShortNoticeBookingRecord,
} from "../shared/short-notice-booking";
import {
  buildShortNoticePaymentLinkEmail,
  isValidCustomerEmail,
} from "../shared/short-notice-payment-email";
import { buildShortNoticeAlternativeOfferEmail } from "../shared/short-notice-alternative-email";
import { buildShortNoticeDeclineEmail } from "../shared/short-notice-decline-email";
import { buildShortNoticeExpiryEmail } from "../shared/short-notice-expiry-email";
import { buildShortNoticeRequestReceivedEmail } from "../shared/short-notice-request-received-email";
import { checkoutAmountsMatch } from "../shared/open-website-payment-fares";
import {
  combinePaymentHoldReasons,
  hasLuggageCapacityHold,
  needsLuggageCapacityConfirmation,
} from "../shared/vehicle-capacity";
import { parseLondonLocalDateTime } from "../shared/uk-time";
import {
  availabilityResourceForVehicle,
  filterUnavailablePeriodsForResource,
  EXECUTIVE_RESOURCE_UNAVAILABLE_MESSAGE,
  MINIBUS_NOTICE_BODY,
  MINIBUS_RESOURCE_UNAVAILABLE_MESSAGE,
} from "../shared/availability-resource";
import { findRequestOnlySmartBlock } from "../shared/smart-availability";
import { getSmartOpsState } from "./smart-ops-store";
import {
  addUnavailablePeriod,
  bookingSettingsPublicView,
  deleteUnavailablePeriod,
  getBookingSettings,
  type BookingSettings,
  updateDepositCashSettings,
  updateMinimumBookingNoticeHours,
  updateMinibusMinimumBookingNoticeHours,
  updateMinimumShortNoticeLeadHours,
  updateCustomerPaymentWindowMinutes,
  updateShortNoticeConfirmationWindowHours,
  updateUnavailablePeriod,
} from "./booking-settings-store";
import {
  claimShortNoticeDecision,
  generatePaymentToken,
  generateShortNoticeReference,
  getShortNoticeByAcceptToken,
  getShortNoticeByReference,
  getShortNoticeByToken,
  listArchivedShortNoticeBookings,
  listOpenShortNoticeBookings,
  saveShortNoticeBooking,
  type ShortNoticeDecisionAction,
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
    paymentExpiresAt: record.paymentExpiresAt,
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

async function sendDeclineEmail(
  env: ShortNoticeEnv,
  record: ShortNoticeBookingRecord,
): Promise<{ sent: boolean; error?: string }> {
  if (!isValidCustomerEmail(record.booking.customerEmail)) {
    return { sent: false, error: "Customer email is missing or invalid." };
  }
  const email = buildShortNoticeDeclineEmail({
    customerName: record.booking.customerName,
    customerEmail: record.booking.customerEmail.trim(),
    pickupLabel: record.booking.pickupLabel,
    dropoffLabel: record.booking.dropoffLabel,
    tripDate: record.originalRequestedDate ?? record.booking.tripDate,
    tripTime: record.originalRequestedTime ?? record.booking.tripTime,
    reference: record.reference,
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

function decisionInFlightError(existingAction?: ShortNoticeDecisionAction): {
  error: string;
  status: number;
} {
  if (existingAction === "expire") {
    return { error: SHORT_NOTICE_RESPONSE_EXPIRED_ADMIN_MESSAGE, status: 409 };
  }
  if (existingAction === "approve") {
    return { error: "This request is already being approved. Refresh and try again.", status: 409 };
  }
  if (existingAction === "decline") {
    return { error: "This request is already being declined. Refresh and try again.", status: 409 };
  }
  return { error: "This request is already being processed. Refresh and try again.", status: 409 };
}

async function sendResponseExpiryEmail(
  env: WorkerEmailEnv,
  record: ShortNoticeBookingRecord,
): Promise<{ sent: boolean; error?: string }> {
  if (!isValidCustomerEmail(record.booking.customerEmail)) {
    return { sent: false, error: "Customer email is missing or invalid." };
  }
  const email = buildShortNoticeExpiryEmail({
    customerName: record.booking.customerName,
    customerEmail: record.booking.customerEmail.trim(),
    confirmationWindowHours: record.shortNoticeConfirmationWindowHours,
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
 * Send the customer expiry email at most once.
 * A KV claim is taken before send and released only if sending fails.
 */
async function sendResponseExpiryEmailOnce(
  env: WorkerEmailEnv & { TRACKING_STORE: KVNamespace },
  record: ShortNoticeBookingRecord,
): Promise<{ record: ShortNoticeBookingRecord; sent: boolean }> {
  if (!isShortNoticeResponseExpiredRecord(record) || record.responseExpiryEmailSentAt) {
    return { record, sent: false };
  }
  const store = env.TRACKING_STORE;
  const key = shortNoticeExpiryEmailKey(record.reference);
  const existingClaim = await store.get(key);
  if (existingClaim) {
    const latest = (await getShortNoticeByReference(store, record.reference)) ?? record;
    return { record: latest, sent: false };
  }
  const token = crypto.randomUUID();
  await store.put(key, token, { expirationTtl: 60 * 60 * 24 * 45 });
  const verified = await store.get(key);
  if (verified !== token) {
    const latest = (await getShortNoticeByReference(store, record.reference)) ?? record;
    return { record: latest, sent: false };
  }
  const latest = (await getShortNoticeByReference(store, record.reference)) ?? record;
  if (!isShortNoticeResponseExpiredRecord(latest) || latest.responseExpiryEmailSentAt) {
    return { record: latest, sent: false };
  }
  const send = await sendResponseExpiryEmail(env, latest);
  if (!send.sent) {
    await store.delete(key);
    return { record: latest, sent: false };
  }
  const stamped: ShortNoticeBookingRecord = {
    ...latest,
    responseExpiryEmailSentAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveShortNoticeBooking(store, stamped);
  return { record: stamped, sent: true };
}

/**
 * Move an unanswered under-notice request to expired when its deadline has passed.
 * Approved, paid, declined, and alternative-offered requests are left alone.
 * Repeated calls do not send a second email.
 */
export async function expireShortNoticeResponseIfDue(
  env: WorkerEmailEnv & { TRACKING_STORE: KVNamespace },
  record: ShortNoticeBookingRecord,
  now = new Date(),
): Promise<{ record: ShortNoticeBookingRecord; blocked: boolean; emailed: boolean }> {
  const store = env.TRACKING_STORE;
  if (isShortNoticeResponseExpiredRecord(record)) {
    const emailed = await sendResponseExpiryEmailOnce(env, record);
    return { record: emailed.record, blocked: true, emailed: emailed.sent };
  }
  if (!isShortNoticeResponseWindowDue(record, now)) {
    return { record, blocked: false, emailed: false };
  }

  const claim = await claimShortNoticeDecision(store, record.reference, "expire");
  if (!claim.ok) {
    const latest = (await getShortNoticeByReference(store, record.reference)) ?? record;
    if (isShortNoticeResponseExpiredRecord(latest)) {
      const emailed = await sendResponseExpiryEmailOnce(env, latest);
      return { record: emailed.record, blocked: true, emailed: emailed.sent };
    }
    return { record: latest, blocked: false, emailed: false };
  }
  if (claim.alreadyClaimed) {
    const latest = (await getShortNoticeByReference(store, record.reference)) ?? record;
    if (isShortNoticeResponseExpiredRecord(latest)) {
      const emailed = await sendResponseExpiryEmailOnce(env, latest);
      return { record: emailed.record, blocked: true, emailed: emailed.sent };
    }
    if (!isShortNoticeResponseWindowDue(latest, now)) {
      return { record: latest, blocked: false, emailed: false };
    }
  }

  const latest = (await getShortNoticeByReference(store, record.reference)) ?? record;
  if (!isShortNoticeResponseWindowDue(latest, now)) {
    return {
      record: latest,
      blocked: isShortNoticeResponseExpiredRecord(latest),
      emailed: false,
    };
  }

  const nowIso = now.toISOString();
  const expired: ShortNoticeBookingRecord = {
    ...latest,
    status: "SHORT_NOTICE_EXPIRED",
    expiryReason: "response_window",
    responseExpiredAt: nowIso,
    history: appendShortNoticeHistory(latest.history, "request_expired", nowIso),
    updatedAt: nowIso,
  };
  await saveShortNoticeBooking(store, expired);
  const stored = (await getShortNoticeByReference(store, expired.reference)) ?? expired;
  if (!isShortNoticeResponseExpiredRecord(stored)) {
    return { record: stored, blocked: false, emailed: false };
  }
  const emailed = await sendResponseExpiryEmailOnce(env, stored);
  return { record: emailed.record, blocked: true, emailed: emailed.sent };
}

export async function processExpiredShortNoticeResponseWindows(
  env: WorkerEmailEnv & { TRACKING_STORE?: KVNamespace },
  now = new Date(),
): Promise<{ expired: number; emailed: number; errors: number }> {
  if (!env.TRACKING_STORE) return { expired: 0, emailed: 0, errors: 0 };
  const scoped = { ...env, TRACKING_STORE: env.TRACKING_STORE };
  const open = await listOpenShortNoticeBookings(scoped.TRACKING_STORE);
  let expired = 0;
  let emailed = 0;
  let errors = 0;
  for (const record of open) {
    if (!isShortNoticeResponseWindowDue(record, now) && !isShortNoticeResponseExpiredRecord(record)) {
      continue;
    }
    try {
      const result = await expireShortNoticeResponseIfDue(scoped, record, now);
      if (result.blocked && result.record.expiryReason === "response_window") expired += 1;
      if (result.emailed) emailed += 1;
    } catch (error) {
      errors += 1;
      console.error("Short-notice response expiry failed", record.reference, error);
    }
  }
  const archived = await listArchivedShortNoticeBookings(scoped.TRACKING_STORE);
  for (const record of archived) {
    if (!isShortNoticeResponseExpiredRecord(record) || record.responseExpiryEmailSentAt) continue;
    try {
      const result = await expireShortNoticeResponseIfDue(scoped, record, now);
      if (result.emailed) emailed += 1;
    } catch (error) {
      errors += 1;
      console.error("Short-notice expiry email retry failed", record.reference, error);
    }
  }
  return { expired, emailed, errors };
}

async function claimOpenDecisionOrConflict(
  store: KVNamespace,
  reference: string,
  action: ShortNoticeDecisionAction,
): Promise<{ proceed: true } | { error: string; status: number } | { alreadyClaimed: true }> {
  const claim = await claimShortNoticeDecision(store, reference, action);
  if (!claim.ok) {
    return { error: claim.error, status: 409 };
  }
  if (claim.alreadyClaimed) {
    return { alreadyClaimed: true };
  }
  return { proceed: true };
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
  if (isShortNoticeResponseExpiredRecord(existing) || isShortNoticeResponseWindowDue(existing, now)) {
    return { error: SHORT_NOTICE_RESPONSE_EXPIRED_ADMIN_MESSAGE, status: 409 };
  }
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

  const paymentSettings = await getBookingSettings(env.TRACKING_STORE);
  const keepApprovedDeadline =
    existing.status === "SHORT_NOTICE_APPROVED" &&
    Boolean(existing.paymentExpiresAt) &&
    !extras.booking;
  const paymentExpiresAt = keepApprovedDeadline
    ? existing.paymentExpiresAt!
    : computeShortNoticePaymentExpiryIso({
        tripDate: booking.tripDate,
        tripTime: booking.tripTime,
        approvedAtIso: approvedAt,
        now,
        customerPaymentWindowMinutes: paymentSettings.customerPaymentWindowMinutes,
      });
  if (new Date(paymentExpiresAt).getTime() <= now.getTime()) {
    const expired: ShortNoticeBookingRecord = {
      ...existing,
      ...extras,
      booking,
      materialFingerprint,
      status: "SHORT_NOTICE_EXPIRED",
      expiryReason: "payment_window",
      updatedAt: approvedAt,
      paymentExpiresAt,
    };
    await saveShortNoticeBooking(env.TRACKING_STORE, expired);
    return { error: "Pickup time has passed — cannot approve for payment.", status: 409 };
  }

  const historyTypes = extras.acceptedAlternativeAt
    ? (["alternative_accepted", "owner_approved", "payment_link_created"] as const)
    : (["owner_approved", "payment_link_created"] as const);
  let history = existing.history;
  for (const type of historyTypes) {
    history = appendShortNoticeHistory(history, type, approvedAt);
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
    history,
    updatedAt: approvedAt,
  };

  const payUrl = buildShortNoticePayUrl(siteOrigin, record.paymentToken);

  const latestBeforeSave = await getShortNoticeByReference(env.TRACKING_STORE, record.reference);
  if (
    latestBeforeSave &&
    (isShortNoticeResponseExpiredRecord(latestBeforeSave) ||
      isShortNoticeResponseWindowDue(latestBeforeSave, now))
  ) {
    return { error: SHORT_NOTICE_RESPONSE_EXPIRED_ADMIN_MESSAGE, status: 409 };
  }
  if (
    latestBeforeSave?.status === "SHORT_NOTICE_DECLINED" ||
    latestBeforeSave?.status === "SHORT_NOTICE_ALTERNATIVE_DECLINED"
  ) {
    return { error: "This request was declined and cannot be approved.", status: 409 };
  }
  if (latestBeforeSave?.status === "SHORT_NOTICE_PAID") {
    return { error: "This booking has already been paid and confirmed.", status: 409 };
  }

  // Persist APPROVED before email so a lost concurrent write cannot send a
  // second acceptance after the other decision has already been stored.
  await saveShortNoticeBooking(env.TRACKING_STORE, record);

  const latest = (await getShortNoticeByReference(env.TRACKING_STORE, record.reference)) ?? record;
  let nextRecord = latest;
  let paymentEmailSent = false;
  let paymentEmailError: string | undefined;

  if (shouldAutoSendPaymentLinkEmail(latest, payUrl, now)) {
    const send = await sendPaymentLinkEmail(env, latest, payUrl);
    paymentEmailSent = send.sent;
    paymentEmailError = send.error;
    if (send.sent) {
      const afterSend = await getShortNoticeByReference(env.TRACKING_STORE, record.reference);
      if (
        afterSend?.status === "SHORT_NOTICE_DECLINED" ||
        afterSend?.status === "SHORT_NOTICE_ALTERNATIVE_DECLINED" ||
        afterSend?.status === "SHORT_NOTICE_PAID"
      ) {
        return {
          error:
            afterSend.status === "SHORT_NOTICE_PAID"
              ? "This booking has already been paid and confirmed."
              : "This request was declined and cannot be approved.",
          status: 409,
        };
      }
      nextRecord = {
        ...(afterSend ?? latest),
        paymentLinkEmailSentAt: approvedAt,
        paymentLinkEmailPayUrl: payUrl,
        updatedAt: approvedAt,
      };
      await saveShortNoticeBooking(env.TRACKING_STORE, nextRecord);
    }
  }

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
    suitcasesExact: record.booking.suitcasesExact,
    flightNumber: record.booking.flightNumber,
    paymentExpiresAt: record.paymentExpiresAt ?? null,
    expiryReason: record.expiryReason ?? null,
    payable: isShortNoticePayable(record),
  };
}

async function createMinibusNoticeRequest(
  options: {
    store: KVNamespace;
    booking: PaidBookingDetails;
    amount: number;
    personalQuoteCode?: string;
    standardWebsiteAmount?: number;
  },
  settings: BookingSettings,
  periods: UnavailablePeriod[],
  now: Date,
): Promise<{ record: ShortNoticeBookingRecord; whatsappUrl: string }> {
  const noticeHours = settings.minibusMinimumBookingNoticeHours;
  const underMinimumNotice = isWithinMinimumBookingNotice(
    options.booking.tripDate,
    options.booking.tripTime,
    now,
    noticeHours,
  );
  const blocking = findRequestOnlyBlockingPeriod(
    options.booking.tripDate,
    options.booking.tripTime,
    periods,
    now,
  );
  const holdReasons = combinePaymentHoldReasons({
    underMinimumNotice,
    blockingPeriodId: blocking?.id ?? null,
    passengers: options.booking.passengers,
    suitcases: options.booking.suitcases,
    suitcasesExact: options.booking.suitcasesExact,
  });
  if (holdReasons.length === 0) {
    throw new Error("This 7-Seater journey is outside the confirmation period.");
  }

  const amount = Math.round(options.amount * 100) / 100;
  const reference = generateShortNoticeReference(now);
  const paymentToken = generatePaymentToken();
  const fingerprint = materialJourneyFingerprint({
    ...options.booking,
    amount,
  });
  const createdAt = now.toISOString();
  const confirmationWindowHours = settings.shortNoticeConfirmationWindowHours;
  const shortNoticeExpiresAt = underMinimumNotice
    ? shortNoticeResponseExpiresAtIso(createdAt, confirmationWindowHours)
    : undefined;
  const record: ShortNoticeBookingRecord = {
    reference,
    paymentToken,
    status: "SHORT_NOTICE_AWAITING_APPROVAL",
    amount,
    currency: "GBP",
    amountLabel: formatAmountLabel(amount),
    booking: options.booking,
    materialFingerprint: fingerprint,
    unavailablePeriodIdApplied: blocking?.id ?? null,
    underMinimumNotice,
    minibusNotice: true,
    holdReasons,
    ...(underMinimumNotice
      ? {
          minimumNoticeHoursApplied: noticeHours,
          shortNoticeConfirmationWindowHours: confirmationWindowHours,
          shortNoticeRequestedAt: createdAt,
          shortNoticeExpiresAt,
        }
      : {}),
    history: appendShortNoticeHistory(undefined, "request_submitted", createdAt),
    createdAt,
    updatedAt: createdAt,
    ...(options.personalQuoteCode ? { personalQuoteCode: options.personalQuoteCode } : {}),
    ...(typeof options.standardWebsiteAmount === "number"
      ? { standardWebsiteAmount: options.standardWebsiteAmount }
      : {}),
  };
  await saveShortNoticeBooking(options.store, record);
  return { record, whatsappUrl: buildCustomerWhatsAppUrl(reference) };
}

/** Request-only smart rules share the existing approval path. Unavailable rules do not. */
async function requestOnlySmartBlockForPickup(
  store: KVNamespace,
  tripDate: string,
  tripTime: string,
) {
  const state = await getSmartOpsState(store);
  return findRequestOnlySmartBlock({
    rules: state.rules,
    exceptions: state.exceptions,
    tripDate,
    tripTime,
  });
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
  const resource = availabilityResourceForVehicle(options.booking.vehicle);
  const periods = filterUnavailablePeriodsForResource(settings.unavailablePeriods, resource);
  const closed = findConflictingNoAvailabilityPeriod(options.booking, periods, now);
  if (closed) {
    throw new OwnerNoAvailabilityError(
      resource === "minibus"
        ? MINIBUS_RESOURCE_UNAVAILABLE_MESSAGE
        : resource === "executive"
          ? EXECUTIVE_RESOURCE_UNAVAILABLE_MESSAGE
          : undefined,
    );
  }
  if (resource === "minibus") {
    return createMinibusNoticeRequest(options, settings, periods, now);
  }
  const leadHours = settings.minimumShortNoticeLeadHours;
  if (
    isBelowMinimumShortNoticeLead(
      options.booking.tripDate,
      options.booking.tripTime,
      now,
      leadHours,
    )
  ) {
    throw new PickupTooSoonError(leadHours);
  }
  const blocking = findRequestOnlyBlockingPeriod(
    options.booking.tripDate,
    options.booking.tripTime,
    periods,
    now,
  );
  const smartBlock = blocking
    ? null
    : await requestOnlySmartBlockForPickup(
        options.store,
        options.booking.tripDate,
        options.booking.tripTime,
      );

  const noticeHours = settings.minimumBookingNoticeHours;
  const underMinimumNotice = isWithinMinimumBookingNotice(
    options.booking.tripDate,
    options.booking.tripTime,
    now,
    noticeHours,
  );
  const holdReasons = combinePaymentHoldReasons({
    underMinimumNotice,
    blockingPeriodId: blocking?.id ?? smartBlock?.ruleId ?? null,
    passengers: options.booking.passengers,
    suitcases: options.booking.suitcases,
    suitcasesExact: options.booking.suitcasesExact,
  });
  if (holdReasons.length === 0) {
    throw new Error("This journey is not inside a short-notice window.");
  }

  const amount = Math.round(options.amount * 100) / 100;
  const reference = generateShortNoticeReference(now);
  const paymentToken = generatePaymentToken();
  const fingerprint = materialJourneyFingerprint({
    ...options.booking,
    amount,
  });
  const createdAt = now.toISOString();
  const confirmationWindowHours = settings.shortNoticeConfirmationWindowHours;
  const shortNoticeExpiresAt = underMinimumNotice
    ? shortNoticeResponseExpiresAtIso(createdAt, confirmationWindowHours)
    : undefined;

  const record: ShortNoticeBookingRecord = {
    reference,
    paymentToken,
    status: "SHORT_NOTICE_AWAITING_APPROVAL",
    amount,
    currency: "GBP",
    amountLabel: formatAmountLabel(amount),
    booking: options.booking,
    materialFingerprint: fingerprint,
    unavailablePeriodIdApplied: blocking?.id ?? smartBlock?.ruleId ?? null,
    underMinimumNotice,
    holdReasons,
    ...(underMinimumNotice
      ? {
          minimumNoticeHoursApplied: noticeHours,
          minimumShortNoticeLeadHoursApplied: leadHours,
          shortNoticeConfirmationWindowHours: confirmationWindowHours,
          shortNoticeRequestedAt: createdAt,
          shortNoticeExpiresAt,
        }
      : {}),
    history: appendShortNoticeHistory(undefined, "request_submitted", createdAt),
    createdAt,
    updatedAt: createdAt,
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

export async function sendShortNoticeRequestReceivedEmail(
  env: WorkerEmailEnv,
  record: ShortNoticeBookingRecord,
): Promise<{ sent: boolean; error?: string }> {
  if (!record.underMinimumNotice && !hasLuggageCapacityHold(record.holdReasons)) {
    return { sent: false };
  }
  if (!isValidCustomerEmail(record.booking.customerEmail)) {
    return { sent: false, error: "Customer email is missing or invalid." };
  }
  const email = buildShortNoticeRequestReceivedEmail({
    customerName: record.booking.customerName,
    customerEmail: record.booking.customerEmail.trim(),
    pickupLabel: record.booking.pickupLabel,
    dropoffLabel: record.booking.dropoffLabel,
    tripDate: record.booking.tripDate,
    tripTime: record.booking.tripTime,
    amountLabel: record.amountLabel,
    reference: record.reference,
    noticeHours: record.minimumNoticeHoursApplied ?? MINIMUM_BOOKING_NOTICE_HOURS,
    holdReasons: record.holdReasons,
    minibusNotice: record.minibusNotice === true,
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
 * Re-check Owner unavailable periods immediately before SumUp checkout.
 * Read-only — expired periods are ignored without a KV write.
 */
export async function evaluateOwnerNoAvailabilityFromStore(
  store: KVNamespace,
  booking: OwnerAvailabilityBooking,
  now = new Date(),
): Promise<PublicOwnerAvailability> {
  const settings = await getBookingSettings(store);
  const resource = availabilityResourceForVehicle(booking.vehicle);
  const periods = filterUnavailablePeriodsForResource(settings.unavailablePeriods, resource);
  const result = evaluateOwnerNoAvailability(booking, periods, now);
  if (result.blocked && resource === "minibus") {
    return { ...result, customerMessage: MINIBUS_RESOURCE_UNAVAILABLE_MESSAGE };
  }
  if (result.blocked && resource === "executive") {
    return { ...result, customerMessage: EXECUTIVE_RESOURCE_UNAVAILABLE_MESSAGE };
  }
  return result;
}

export async function shouldForceShortNotice(
  store: KVNamespace,
  booking: PaidBookingDetails,
  now = new Date(),
): Promise<{
  shortNotice: boolean;
  noAvailability: boolean;
  gateActive: boolean;
  blockingPeriodId: string | null;
  blockingPeriodLabel: string | null;
  underMinimumNotice: boolean;
  minimumNoticeHours: number;
  minimumShortNoticeLeadHours: number;
  tooSoon: boolean;
  luggageCapacity: boolean;
  /** Separate 7-Seater notice. Owner short-notice hours are not used. */
  minibusNotice: boolean;
}> {
  const settings = await getBookingSettings(store);
  const resource = availabilityResourceForVehicle(booking.vehicle);
  const periods = filterUnavailablePeriodsForResource(settings.unavailablePeriods, resource);
  const luggageCapacity = needsLuggageCapacityConfirmation(
    booking.passengers,
    booking.suitcases,
    { suitcasesExact: booking.suitcasesExact },
  );
  if (resource === "minibus") {
    const noticeHours = settings.minibusMinimumBookingNoticeHours;
    const closed = findConflictingNoAvailabilityPeriod(booking, periods, now);
    const underMinibusNotice = isWithinMinimumBookingNotice(
      booking.tripDate,
      booking.tripTime,
      now,
      noticeHours,
    );
    if (closed) {
      return {
        shortNotice: false,
        noAvailability: true,
        gateActive: true,
        blockingPeriodId: closed.id,
        blockingPeriodLabel: formatUnavailablePeriodRangeLabel(closed),
        underMinimumNotice: false,
        minimumNoticeHours: noticeHours,
        minimumShortNoticeLeadHours: settings.minimumShortNoticeLeadHours,
        tooSoon: false,
        luggageCapacity,
        minibusNotice: true,
      };
    }
    const blocking = findRequestOnlyBlockingPeriod(
      booking.tripDate,
      booking.tripTime,
      periods,
      now,
    );
    return {
      shortNotice: Boolean(blocking) || underMinibusNotice,
      noAvailability: false,
      gateActive: Boolean(blocking) || underMinibusNotice,
      blockingPeriodId: blocking?.id ?? null,
      blockingPeriodLabel: blocking ? formatUnavailablePeriodRangeLabel(blocking) : null,
      underMinimumNotice: underMinibusNotice,
      minimumNoticeHours: noticeHours,
      minimumShortNoticeLeadHours: settings.minimumShortNoticeLeadHours,
      tooSoon: false,
      luggageCapacity,
      minibusNotice: true,
    };
  }
  if (resource === "executive") {
    const closed = findConflictingNoAvailabilityPeriod(booking, periods, now);
    const blocking = closed
      ? null
      : findRequestOnlyBlockingPeriod(booking.tripDate, booking.tripTime, periods, now);
    const unavailable = closed ?? blocking;
    return {
      shortNotice: false,
      noAvailability: Boolean(unavailable),
      gateActive: Boolean(unavailable),
      blockingPeriodId: unavailable?.id ?? null,
      blockingPeriodLabel: unavailable ? formatUnavailablePeriodRangeLabel(unavailable) : null,
      underMinimumNotice: false,
      minimumNoticeHours: settings.minimumBookingNoticeHours,
      minimumShortNoticeLeadHours: settings.minimumShortNoticeLeadHours,
      tooSoon: false,
      luggageCapacity,
      minibusNotice: false,
    };
  }
  const closed = findConflictingNoAvailabilityPeriod(booking, periods, now);
  const leadHours = settings.minimumShortNoticeLeadHours;
  const tooSoon = isBelowMinimumShortNoticeLead(
    booking.tripDate,
    booking.tripTime,
    now,
    leadHours,
  );
  if (closed) {
    return {
      shortNotice: false,
      noAvailability: true,
      gateActive: true,
      blockingPeriodId: closed.id,
      blockingPeriodLabel: formatUnavailablePeriodRangeLabel(closed),
      underMinimumNotice: false,
      minimumNoticeHours: settings.minimumBookingNoticeHours,
      minimumShortNoticeLeadHours: leadHours,
      tooSoon,
      luggageCapacity,
      minibusNotice: false,
    };
  }
  const blocking = findRequestOnlyBlockingPeriod(
    booking.tripDate,
    booking.tripTime,
    periods,
    now,
  );
  const smartBlock = blocking
    ? null
    : await requestOnlySmartBlockForPickup(store, booking.tripDate, booking.tripTime);
  const noticeHours = settings.minimumBookingNoticeHours;
  const underMinimumNotice = isWithinMinimumBookingNotice(
    booking.tripDate,
    booking.tripTime,
    now,
    noticeHours,
  );
  const activePeriods = listActiveUnavailablePeriods(periods, now);
  return {
    shortNotice: Boolean(blocking) || Boolean(smartBlock) || underMinimumNotice,
    noAvailability: false,
    gateActive: activePeriods.length > 0 || Boolean(smartBlock) || underMinimumNotice,
    blockingPeriodId: blocking?.id ?? smartBlock?.ruleId ?? null,
    blockingPeriodLabel: blocking
      ? formatUnavailablePeriodRangeLabel(blocking)
      : smartBlock
        ? `${smartBlock.startLocal.replace("T", " ")} – ${smartBlock.endLocal.replace("T", " ")}`
        : null,
    underMinimumNotice,
    minimumNoticeHours: noticeHours,
    minimumShortNoticeLeadHours: leadHours,
    tooSoon,
    luggageCapacity,
    minibusNotice: false,
  };
}

export async function handleOwnerListShortNotice(
  request: Request,
  env: ShortNoticeEnv,
): Promise<{ ok: true; bookings: ShortNoticeBookingRecord[] } | { error: string; status: number }> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }
  await processExpiredShortNoticeResponseWindows(env);
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

  const loaded = await getShortNoticeByReference(env.TRACKING_STORE, reference);
  if (!loaded) return { error: "Short-notice booking not found.", status: 404 };
  const expiry = await expireShortNoticeResponseIfDue(env, loaded, new Date());
  if (expiry.blocked) {
    return { error: SHORT_NOTICE_RESPONSE_EXPIRED_ADMIN_MESSAGE, status: 409 };
  }
  const existing = expiry.record;
  if (existing.status === "SHORT_NOTICE_ALTERNATIVE_OFFERED") {
    return {
      error: "An alternative time is already offered — withdraw it first, or wait for the customer to accept.",
      status: 409,
    };
  }
  if (existing.status === "SHORT_NOTICE_APPROVED") {
    const payUrl = buildShortNoticePayUrl(siteOrigin, existing.paymentToken);
    return {
      ok: true,
      record: existing,
      payUrl,
      whatsappPayUrl: buildOwnerWhatsAppPayUrl(existing, payUrl),
      paymentEmailSent: Boolean(existing.paymentLinkEmailSentAt),
    };
  }
  if (existing.status !== "SHORT_NOTICE_AWAITING_APPROVAL") {
    if (existing.status === "SHORT_NOTICE_DECLINED") {
      return { error: "This request was declined and cannot be approved.", status: 409 };
    }
    if (existing.status === "SHORT_NOTICE_PAID") {
      return { error: "This booking is already paid.", status: 409 };
    }
    if (isShortNoticeResponseExpiredRecord(existing)) {
      return { error: SHORT_NOTICE_RESPONSE_EXPIRED_ADMIN_MESSAGE, status: 409 };
    }
    return { error: "Booking cannot be approved in its current status.", status: 409 };
  }

  const claim = await claimOpenDecisionOrConflict(env.TRACKING_STORE, reference, "approve");
  if ("error" in claim) return { error: claim.error, status: claim.status };
  if ("alreadyClaimed" in claim) {
    const latest = await getShortNoticeByReference(env.TRACKING_STORE, reference);
    if (latest?.status === "SHORT_NOTICE_APPROVED") {
      const payUrl = buildShortNoticePayUrl(siteOrigin, latest.paymentToken);
      return {
        ok: true,
        record: latest,
        payUrl,
        whatsappPayUrl: buildOwnerWhatsAppPayUrl(latest, payUrl),
        paymentEmailSent: Boolean(latest.paymentLinkEmailSentAt),
      };
    }
    if (latest?.status === "SHORT_NOTICE_DECLINED") {
      return { error: "This request was declined and cannot be approved.", status: 409 };
    }
    if (latest && isShortNoticeResponseExpiredRecord(latest)) {
      return { error: SHORT_NOTICE_RESPONSE_EXPIRED_ADMIN_MESSAGE, status: 409 };
    }
    return decisionInFlightError("approve");
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

  const loaded = await getShortNoticeByReference(env.TRACKING_STORE, reference);
  if (!loaded) return { error: "Short-notice booking not found.", status: 404 };
  const expiry = await expireShortNoticeResponseIfDue(env, loaded, new Date());
  if (expiry.blocked) {
    return { error: SHORT_NOTICE_RESPONSE_EXPIRED_ADMIN_MESSAGE, status: 409 };
  }
  const existing = expiry.record;
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
    history: appendShortNoticeHistory(existing.history, "alternative_time_offered", nowIso),
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

  const claim = await claimOpenDecisionOrConflict(env.TRACKING_STORE, existing.reference, "approve");
  if ("error" in claim) return { error: claim.error, status: claim.status };
  if ("alreadyClaimed" in claim) {
    const latest = await getShortNoticeByReference(env.TRACKING_STORE, existing.reference);
    if (latest?.status === "SHORT_NOTICE_APPROVED" && latest.acceptedAlternativeAt) {
      const payUrl = buildShortNoticePayUrl(siteOrigin, latest.paymentToken);
      return {
        ok: true,
        record: latest,
        payUrl,
        whatsappPayUrl: buildOwnerWhatsAppPayUrl(latest, payUrl),
        paymentEmailSent: Boolean(latest.paymentLinkEmailSentAt),
        alreadyAccepted: true,
      };
    }
    return decisionInFlightError("approve");
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

  const claim = await claimOpenDecisionOrConflict(env.TRACKING_STORE, existing.reference, "decline");
  if ("error" in claim) return { error: claim.error, status: claim.status };
  if ("alreadyClaimed" in claim) {
    const latest = await getShortNoticeByReference(env.TRACKING_STORE, existing.reference);
    if (latest?.status === "SHORT_NOTICE_ALTERNATIVE_DECLINED" && latest.declinedAlternativeAt) {
      return { ok: true, record: latest, alreadyDeclined: true };
    }
    return decisionInFlightError("decline");
  }

  const nowIso = new Date().toISOString();
  const record: ShortNoticeBookingRecord = {
    ...existing,
    status: "SHORT_NOTICE_ALTERNATIVE_DECLINED",
    customerResponse: "declined",
    customerResponseAt: nowIso,
    declinedAlternativeAt: nowIso,
    history: appendShortNoticeHistory(existing.history, "alternative_declined", nowIso),
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
  const loaded = await getShortNoticeByReference(env.TRACKING_STORE, reference);
  if (!loaded) return { error: "Short-notice booking not found.", status: 404 };
  const expiry = await expireShortNoticeResponseIfDue(env, loaded, new Date());
  if (expiry.blocked) {
    return { error: SHORT_NOTICE_RESPONSE_EXPIRED_ADMIN_MESSAGE, status: 409 };
  }
  const existing = expiry.record;
  if (existing.status === "SHORT_NOTICE_PAID") {
    return { error: "Already paid — cannot decline.", status: 409 };
  }
  if (existing.status === "SHORT_NOTICE_DECLINED") {
    return { ok: true, record: existing };
  }
  if (
    existing.status !== "SHORT_NOTICE_AWAITING_APPROVAL" &&
    existing.status !== "SHORT_NOTICE_ALTERNATIVE_OFFERED" &&
    existing.status !== "SHORT_NOTICE_APPROVED"
  ) {
    return { error: "Request cannot be declined in its current status.", status: 409 };
  }

  if (
    existing.status === "SHORT_NOTICE_AWAITING_APPROVAL" ||
    existing.status === "SHORT_NOTICE_ALTERNATIVE_OFFERED"
  ) {
    const claim = await claimOpenDecisionOrConflict(env.TRACKING_STORE, reference, "decline");
    if ("error" in claim) return { error: claim.error, status: claim.status };
    if ("alreadyClaimed" in claim) {
      const latest = await getShortNoticeByReference(env.TRACKING_STORE, reference);
      if (latest?.status === "SHORT_NOTICE_DECLINED") {
        return { ok: true, record: latest };
      }
      if (latest?.status === "SHORT_NOTICE_APPROVED") {
        return { error: "This request is already being approved. Refresh and try again.", status: 409 };
      }
      return decisionInFlightError("decline");
    }
  }

  const nowIso = new Date().toISOString();
  let record: ShortNoticeBookingRecord = {
    ...existing,
    status: "SHORT_NOTICE_DECLINED",
    declinedAt: nowIso,
    declineReason: String(body.reason ?? "").trim() || undefined,
    history: appendShortNoticeHistory(existing.history, "owner_declined", nowIso),
    updatedAt: nowIso,
    paymentExpiresAt: nowIso,
  };
  // Persist DECLINED before email so a concurrent approve cannot send
  // acceptance after this decline has already been stored.
  await saveShortNoticeBooking(env.TRACKING_STORE, record);
  const latest = (await getShortNoticeByReference(env.TRACKING_STORE, reference)) ?? record;
  if (!latest.declineEmailSentAt) {
    const send = await sendDeclineEmail(env, latest);
    if (send.sent) {
      record = { ...latest, declineEmailSentAt: nowIso, updatedAt: nowIso };
      await saveShortNoticeBooking(env.TRACKING_STORE, record);
    } else {
      record = latest;
    }
  } else {
    record = latest;
  }
  return { ok: true, record };
}

export async function resolveShortNoticeForPayment(
  store: KVNamespace,
  token: string,
  now = new Date(),
  env?: WorkerEmailEnv,
): Promise<{ ok: true; record: ShortNoticeBookingRecord } | { error: string; status: number }> {
  let record = await getShortNoticeByToken(store, token);
  if (!record) return { error: "Payment link not found.", status: 404 };

  if (isShortNoticeResponseWindowDue(record, now) || isShortNoticeResponseExpiredRecord(record)) {
    if (env) {
      const expiry = await expireShortNoticeResponseIfDue(
        { ...env, TRACKING_STORE: store },
        record,
        now,
      );
      record = expiry.record;
    }
    if (
      isShortNoticeResponseExpiredRecord(record) ||
      isShortNoticeResponseWindowDue(record, now) ||
      record.status !== "SHORT_NOTICE_APPROVED"
    ) {
      return { error: SHORT_NOTICE_RESPONSE_EXPIRED_CUSTOMER_MESSAGE, status: 409 };
    }
  }

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
        expiryReason: record.expiryReason ?? "payment_window",
        updatedAt: now.toISOString(),
      };
      await saveShortNoticeBooking(store, expired);
    }
    return { error: customerPaymentLinkExpiredMessage(), status: 409 };
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

export async function gateShortNoticePaidCheckout(
  store: KVNamespace,
  input: {
    token: string;
    checkoutId: string;
    sumUpAmount: number;
    currency?: string | null;
    sumUpCheckoutCreatedAt?: string | null;
    pendingCreatedAt?: string | null;
    now?: Date;
  },
): Promise<{ ok: true; record: ShortNoticeBookingRecord } | { ok: false; error: string; status: number }> {
  const now = input.now ?? new Date();
  const record = await getShortNoticeByToken(store, input.token);
  if (!record) return { ok: false, error: "Payment link not found.", status: 404 };

  if (record.status === "SHORT_NOTICE_PAID") {
    if (record.checkoutId?.trim() === input.checkoutId.trim()) {
      return { ok: true, record };
    }
    return { ok: false, error: "This booking has already been paid and confirmed.", status: 409 };
  }
  if (isShortNoticeResponseExpiredRecord(record) || isShortNoticeResponseWindowDue(record, now)) {
    return { ok: false, error: SHORT_NOTICE_RESPONSE_EXPIRED_CUSTOMER_MESSAGE, status: 409 };
  }
  if (record.status === "SHORT_NOTICE_DECLINED" || record.status === "SHORT_NOTICE_ALTERNATIVE_DECLINED") {
    return { ok: false, error: "This booking request was declined.", status: 409 };
  }
  if (
    record.status !== "SHORT_NOTICE_APPROVED" &&
    record.status !== "SHORT_NOTICE_EXPIRED"
  ) {
    return { ok: false, error: "This booking is not ready for payment.", status: 409 };
  }
  if (record.status === "SHORT_NOTICE_EXPIRED" && record.expiryReason === "response_window") {
    return { ok: false, error: SHORT_NOTICE_RESPONSE_EXPIRED_CUSTOMER_MESSAGE, status: 409 };
  }

  const currency = input.currency?.trim().toUpperCase();
  if (currency && currency !== "GBP") {
    return { ok: false, error: "Payment currency does not match the approved booking.", status: 409 };
  }
  const expected = record.approvedAmount ?? record.amount;
  if (!checkoutAmountsMatch(input.sumUpAmount, expected)) {
    return { ok: false, error: "Payment amount does not match the approved booking.", status: 409 };
  }

  const decision = shortNoticeVerifiedCheckoutDecision({
    paymentExpiresAt: record.paymentExpiresAt,
    now,
    storedCheckoutId: record.checkoutId,
    presentedCheckoutId: input.checkoutId,
    checkoutStartedAt: record.checkoutStartedAt,
    legacyCheckoutRecordedAt: input.pendingCreatedAt,
    sumUpCheckoutCreatedAt: input.sumUpCheckoutCreatedAt ?? record.sumUpCheckoutCreatedAt,
  });
  if (!decision.ok) {
    if (
      (decision.reason === "after_deadline" || decision.reason === "sumup_date_not_in_window") &&
      record.status === "SHORT_NOTICE_APPROVED"
    ) {
      await saveShortNoticeBooking(store, {
        ...record,
        status: "SHORT_NOTICE_EXPIRED",
        expiryReason: record.expiryReason ?? "payment_window",
        updatedAt: now.toISOString(),
      });
    }
    if (decision.reason === "checkout_mismatch" || decision.reason === "missing_checkout") {
      return { ok: false, error: "Payment could not be verified for this booking.", status: 409 };
    }
    return { ok: false, error: customerPaymentLinkExpiredMessage(), status: 409 };
  }

  return { ok: true, record };
}

export async function markShortNoticePaid(
  store: KVNamespace,
  token: string,
  paymentReference: string,
  checkoutId: string,
  options?: {
    now?: Date;
    legacyCheckoutRecordedAt?: string | null;
    sumUpCheckoutCreatedAt?: string | null;
  },
): Promise<ShortNoticeBookingRecord | null> {
  const now = options?.now ?? new Date();
  const record = await getShortNoticeByToken(store, token);
  if (!record) return null;
  if (record.status === "SHORT_NOTICE_PAID") return record;
  if (isShortNoticeResponseExpiredRecord(record)) return null;
  if (record.status !== "SHORT_NOTICE_APPROVED" && record.status !== "SHORT_NOTICE_EXPIRED") {
    return null;
  }
  if (record.status === "SHORT_NOTICE_EXPIRED" && record.expiryReason === "response_window") {
    return null;
  }
  const decision = shortNoticeVerifiedCheckoutDecision({
    paymentExpiresAt: record.paymentExpiresAt,
    now,
    storedCheckoutId: record.checkoutId,
    presentedCheckoutId: checkoutId,
    checkoutStartedAt: record.checkoutStartedAt,
    legacyCheckoutRecordedAt: options?.legacyCheckoutRecordedAt,
    sumUpCheckoutCreatedAt: options?.sumUpCheckoutCreatedAt ?? record.sumUpCheckoutCreatedAt,
  });
  if (!decision.ok) return null;
  const nowIso = now.toISOString();
  const paid: ShortNoticeBookingRecord = {
    ...record,
    status: "SHORT_NOTICE_PAID",
    paymentReference,
    checkoutId,
    paidAt: nowIso,
    history: appendShortNoticeHistory(
      appendShortNoticeHistory(record.history, "payment_completed", nowIso),
      "booking_confirmed",
      nowIso,
    ),
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
      journeyReminderAirports: Awaited<
        ReturnType<typeof import("./journey-reminder-store").getJourneyReminderAirportCopy>
      >;
    }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }
  const settings = await getBookingSettings(env.TRACKING_STORE);
  const { getJourneyReminderAirportCopy } = await import("./journey-reminder-store");
  const journeyReminderAirports = await getJourneyReminderAirportCopy(env.TRACKING_STORE);
  return { ok: true, settings: bookingSettingsPublicView(settings), journeyReminderAirports };
}

export async function handleOwnerSaveBookingSettings(
  request: Request,
  env: ShortNoticeEnv,
  body: Record<string, unknown>,
): Promise<
  | {
      ok: true;
      settings: ReturnType<typeof bookingSettingsPublicView>;
      period?: { id: string; startLocal: string; endLocal: string; note?: string; mode?: string };
      journeyReminderAirports?: Awaited<
        ReturnType<typeof import("./journey-reminder-store").getJourneyReminderAirportCopy>
      >;
    }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }

  const action = String(body.action ?? "add").trim().toLowerCase();

  try {
    if (action === "set-notice-hours" || action === "set-minimum-booking-notice-hours") {
      const settings = await updateMinimumBookingNoticeHours(
        env.TRACKING_STORE,
        body.minimumBookingNoticeHours ?? body.hours,
      );
      return { ok: true, settings: bookingSettingsPublicView(settings) };
    }

    if (
      action === "set-minibus-notice-hours" ||
      action === "set-minibus-minimum-booking-notice-hours"
    ) {
      const settings = await updateMinibusMinimumBookingNoticeHours(
        env.TRACKING_STORE,
        body.minibusMinimumBookingNoticeHours ?? body.hours,
      );
      return { ok: true, settings: bookingSettingsPublicView(settings) };
    }

    if (
      action === "set-lead-hours" ||
      action === "set-minimum-short-notice-lead-hours"
    ) {
      const settings = await updateMinimumShortNoticeLeadHours(
        env.TRACKING_STORE,
        body.minimumShortNoticeLeadHours ?? body.hours,
      );
      return { ok: true, settings: bookingSettingsPublicView(settings) };
    }

    if (
      action === "set-confirmation-window" ||
      action === "set-short-notice-confirmation-window"
    ) {
      const settings = await updateShortNoticeConfirmationWindowHours(
        env.TRACKING_STORE,
        body.shortNoticeConfirmationWindowHours ?? body.hours,
      );
      return { ok: true, settings: bookingSettingsPublicView(settings) };
    }

    if (
      action === "set-customer-payment-window" ||
      action === "set-customer-payment-window-minutes"
    ) {
      const settings = await updateCustomerPaymentWindowMinutes(
        env.TRACKING_STORE,
        body.customerPaymentWindowMinutes ?? body.minutes,
      );
      return { ok: true, settings: bookingSettingsPublicView(settings) };
    }

    if (action === "set-journey-reminder-airports") {
      const { saveJourneyReminderAirportCopy } = await import("./journey-reminder-store");
      const journeyReminderAirports = await saveJourneyReminderAirportCopy(
        env.TRACKING_STORE,
        (body.journeyReminderAirports ?? body) as Partial<Record<string, string>>,
      );
      const settings = await getBookingSettings(env.TRACKING_STORE);
      return { ok: true, settings: bookingSettingsPublicView(settings), journeyReminderAirports };
    }

    if (action === "set-deposit-cash" || action === "set-deposit-cash-settings") {
      const settings = await updateDepositCashSettings(
        env.TRACKING_STORE,
        body.depositCash ?? body,
      );
      return { ok: true, settings: bookingSettingsPublicView(settings) };
    }

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
    const mode = normalizeUnavailablePeriodMode(body.mode);
    const resource =
      body.resource === "minibus" ? "minibus" : body.resource === "executive" ? "executive" : undefined;

    if (action === "update") {
      const id = String(body.id ?? "").trim();
      const { settings, period } = await updateUnavailablePeriod(env.TRACKING_STORE, id, {
        id,
        startLocal,
        endLocal,
        note,
        mode,
        resource,
      });
      return {
        ok: true,
        settings: bookingSettingsPublicView(settings),
        period: {
          id: period.id,
          startLocal: period.startLocal,
          endLocal: period.endLocal,
          mode: period.mode,
          ...(period.note ? { note: period.note } : {}),
        },
      };
    }

    // default: add
    const { settings, period } = await addUnavailablePeriod(env.TRACKING_STORE, {
      startLocal,
      endLocal,
      note,
      mode,
      resource,
    });
    return {
      ok: true,
      settings: bookingSettingsPublicView(settings),
      period: {
        id: period.id,
        startLocal: period.startLocal,
        endLocal: period.endLocal,
        mode: period.mode,
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

export function isPublicBookingNoticePath(pathname: string): boolean {
  return pathname === "/booking-notice" || pathname === "/api/booking-notice";
}

export async function handlePublicGetBookingNotice(env: {
  TRACKING_STORE?: KVNamespace;
}): Promise<{
  ok: true;
  minimumBookingNoticeHours: number;
  minibusMinimumBookingNoticeHours: number;
  minimumShortNoticeLeadHours: number;
  shortNoticeConfirmationWindowHours: number;
  depositCash: { enabled: boolean; percent: number; minimumGbp: number };
}> {
  if (!env.TRACKING_STORE) {
    return {
      ok: true,
      minimumBookingNoticeHours: MINIMUM_BOOKING_NOTICE_HOURS,
      minibusMinimumBookingNoticeHours: 24,
      minimumShortNoticeLeadHours: MINIMUM_SHORT_NOTICE_LEAD_HOURS,
      shortNoticeConfirmationWindowHours: SHORT_NOTICE_CONFIRMATION_WINDOW_HOURS,
      depositCash: {
        enabled: false,
        percent: DEFAULT_DEPOSIT_PERCENT,
        minimumGbp: DEFAULT_DEPOSIT_MINIMUM_GBP,
      },
    };
  }
  const settings = await getBookingSettings(env.TRACKING_STORE);
  return {
    ok: true,
    minimumBookingNoticeHours: settings.minimumBookingNoticeHours,
    minibusMinimumBookingNoticeHours: settings.minibusMinimumBookingNoticeHours,
    minimumShortNoticeLeadHours: settings.minimumShortNoticeLeadHours,
    shortNoticeConfirmationWindowHours: settings.shortNoticeConfirmationWindowHours,
    depositCash: {
      enabled: settings.depositCash.enabled === true,
      percent: settings.depositCash.percent,
      minimumGbp: settings.depositCash.minimumGbp,
    },
  };
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
