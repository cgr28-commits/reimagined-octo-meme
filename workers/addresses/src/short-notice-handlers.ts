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
  type ShortNoticeBookingRecord,
} from "../shared/short-notice-booking";
import {
  buildShortNoticePaymentLinkEmail,
  isValidCustomerEmail,
} from "../shared/short-notice-payment-email";
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
  getShortNoticeByReference,
  getShortNoticeByToken,
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
    record.status === "SHORT_NOTICE_AWAITING_APPROVAL"
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
  if (existing.status === "SHORT_NOTICE_DECLINED") {
    return { error: "This request was declined and cannot be approved.", status: 409 };
  }
  if (existing.status === "SHORT_NOTICE_PAID") {
    return { error: "This booking is already paid.", status: 409 };
  }

  const now = new Date();
  const approvedAt = now.toISOString();
  const approvedAmount = existing.amount;
  const approvedFingerprint = materialJourneyFingerprint({
    ...existing.booking,
    amount: approvedAmount,
  });
  if (approvedFingerprint !== existing.materialFingerprint) {
    return {
      error: "Journey details changed since submission — customer must re-submit.",
      status: 409,
    };
  }

  const paymentExpiresAt = computeShortNoticePaymentExpiryIso({
    tripDate: existing.booking.tripDate,
    tripTime: existing.booking.tripTime,
    approvedAtIso: approvedAt,
    now,
  });
  if (new Date(paymentExpiresAt).getTime() <= now.getTime()) {
    const expired: ShortNoticeBookingRecord = {
      ...existing,
      status: "SHORT_NOTICE_EXPIRED",
      updatedAt: approvedAt,
      paymentExpiresAt,
    };
    await saveShortNoticeBooking(env.TRACKING_STORE, expired);
    return { error: "Pickup time has passed — cannot approve for payment.", status: 409 };
  }

  const record: ShortNoticeBookingRecord = {
    ...existing,
    status: "SHORT_NOTICE_APPROVED",
    approvedAt: existing.approvedAt ?? approvedAt,
    approvedBy: "Owner",
    approvedAmount,
    approvedFingerprint,
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
  if (record.status === "SHORT_NOTICE_PAID") {
    return { error: "This booking is already paid.", status: 409 };
  }
  if (record.status === "SHORT_NOTICE_AWAITING_APPROVAL") {
    return { error: "This booking is still awaiting Owner approval.", status: 409 };
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
    pathname === "/owner/short-notice/approve" ||
    pathname === "/api/owner/short-notice/approve" ||
    pathname === "/owner/short-notice/decline" ||
    pathname === "/api/owner/short-notice/decline" ||
    pathname === "/owner/short-notice/resend-payment-email" ||
    pathname === "/api/owner/short-notice/resend-payment-email"
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
    pathname === "/api/payments/short-notice"
  );
}
