/**
 * Short-notice booking: create / list / approve / decline / pay-via-SumUp.
 */

import type { PaidBookingDetails } from "../shared/booking-notifications";
import {
  computeShortNoticePaymentExpiryIso,
  formatAutomaticAvailabilityLabel,
  isPickupBeforeAutomaticAvailability,
  materialJourneyFingerprint,
  normalizeAutomaticAvailabilityLocal,
  vehicleServiceLabel,
} from "../shared/booking-notice";
import {
  isShortNoticePayable,
  type ShortNoticeBookingRecord,
} from "../shared/short-notice-booking";
import {
  effectiveBookingSettings,
  getBookingSettings,
  saveBookingSettings,
  type BookingSettings,
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

export type ShortNoticeEnv = DriverAuthEnv & {
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
}): Promise<{
  record: ShortNoticeBookingRecord;
  whatsappUrl: string;
}> {
  const now = options.now ?? new Date();
  const settings = await getBookingSettings(options.store);
  const availableFrom = settings.automaticBookingsAvailableFrom;

  if (
    !isPickupBeforeAutomaticAvailability(
      options.booking.tripDate,
      options.booking.tripTime,
      availableFrom,
      now,
    )
  ) {
    throw new Error("Pickup is within automatic booking availability — use SumUp checkout.");
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
    automaticBookingsAvailableFromApplied: availableFrom,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  await saveShortNoticeBooking(options.store, record);
  return { record, whatsappUrl: buildCustomerWhatsAppUrl(reference) };
}

export async function shouldForceShortNotice(
  store: KVNamespace,
  booking: PaidBookingDetails,
  now = new Date(),
): Promise<{
  shortNotice: boolean;
  availableFrom: string | null;
  availableFromLabel: string | null;
  gateActive: boolean;
}> {
  const settings = await getBookingSettings(store);
  const effective = effectiveBookingSettings(settings, now);
  const availableFrom = effective.automaticBookingsAvailableFrom;
  const shortNotice = isPickupBeforeAutomaticAvailability(
    booking.tripDate,
    booking.tripTime,
    availableFrom,
    now,
  );
  return {
    shortNotice,
    availableFrom,
    availableFromLabel: formatAutomaticAvailabilityLabel(availableFrom),
    gateActive: effective.gateActive,
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
    approvedAt,
    approvedBy: "Owner",
    approvedAmount,
    approvedFingerprint,
    paymentExpiresAt,
    updatedAt: approvedAt,
  };
  await saveShortNoticeBooking(env.TRACKING_STORE, record);

  const payUrl = `${siteOrigin.replace(/\/$/, "")}/pay/short-notice/?token=${encodeURIComponent(record.paymentToken)}`;
  return {
    ok: true,
    record,
    payUrl,
    whatsappPayUrl: buildOwnerWhatsAppPayUrl(record, payUrl),
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
      settings: BookingSettings & {
        gateActive: boolean;
        availableFromLabel: string | null;
      };
    }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }
  const settings = await getBookingSettings(env.TRACKING_STORE);
  const effective = effectiveBookingSettings(settings);
  return {
    ok: true,
    settings: {
      ...settings,
      // Surface effective (auto-expired) value for Owner UI clarity.
      automaticBookingsAvailableFrom: effective.automaticBookingsAvailableFrom,
      gateActive: effective.gateActive,
      availableFromLabel: formatAutomaticAvailabilityLabel(
        effective.automaticBookingsAvailableFrom,
      ),
    },
  };
}

export async function handleOwnerSaveBookingSettings(
  request: Request,
  env: ShortNoticeEnv,
  body: Record<string, unknown>,
): Promise<
  | {
      ok: true;
      settings: BookingSettings & {
        gateActive: boolean;
        availableFromLabel: string | null;
      };
    }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }

  const clear =
    body.clear === true ||
    body.automaticBookingsAvailableFrom === null ||
    body.automaticBookingsAvailableFrom === "";

  let availableFrom: string | null = null;
  if (!clear) {
    const raw =
      typeof body.automaticBookingsAvailableFrom === "string"
        ? body.automaticBookingsAvailableFrom
        : typeof body.date === "string" && typeof body.time === "string"
          ? `${body.date.trim()}T${body.time.trim()}`
          : "";
    availableFrom = normalizeAutomaticAvailabilityLocal(raw);
    if (!availableFrom) {
      return {
        error: "Provide a valid availability date and time (Europe/London).",
        status: 400,
      };
    }
  }

  const settings = await saveBookingSettings(env.TRACKING_STORE, {
    automaticBookingsAvailableFrom: availableFrom,
    updatedAt: new Date().toISOString(),
  });
  const effective = effectiveBookingSettings(settings);
  return {
    ok: true,
    settings: {
      ...settings,
      automaticBookingsAvailableFrom: effective.automaticBookingsAvailableFrom,
      gateActive: effective.gateActive,
      availableFromLabel: formatAutomaticAvailabilityLabel(
        effective.automaticBookingsAvailableFrom,
      ),
    },
  };
}

export { getShortNoticeByToken, getBookingSettings };

export function isOwnerShortNoticePath(pathname: string): boolean {
  return (
    pathname === "/owner/short-notice" ||
    pathname === "/api/owner/short-notice" ||
    pathname === "/owner/short-notice/approve" ||
    pathname === "/api/owner/short-notice/approve" ||
    pathname === "/owner/short-notice/decline" ||
    pathname === "/api/owner/short-notice/decline"
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
