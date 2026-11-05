/**
 * Record a WhatsApp how-heard survey reply on the customer's latest paid booking.
 * Never touches Google Ads attribution or conversion upload fields.
 */

import type { HowHeardOption } from "../shared/how-heard-source";
import { sameCustomerPhone } from "../shared/whatsapp-pickup-info";
import {
  getPaidBookingRecord,
  listRecentPaidBookings,
  listUpcomingPaidBookings,
  savePaidBookingRecord,
} from "./paid-booking-store";
import type { PaidBookingRecord } from "../shared/paid-booking-record";

export type HowHeardRecordResult =
  | { ok: true; booking: PaidBookingRecord; alreadyRecorded: boolean }
  | { ok: false; reason: "no_booking" | "save_failed" };

async function candidateBookingsForPhone(
  store: KVNamespace,
  phone: string,
): Promise<PaidBookingRecord[]> {
  const byRef = new Map<string, PaidBookingRecord>();
  const upcoming = await listUpcomingPaidBookings(store, {
    pastDays: 14,
    futureDays: 180,
    limit: 250,
  });
  for (const booking of upcoming) {
    if (sameCustomerPhone(booking.mobileNumber, phone)) {
      byRef.set(booking.paymentReference, booking);
    }
  }
  // Recent payments cover confirmations whose trip date is further out / already past.
  const recent = await listRecentPaidBookings(store, { days: 14, limit: 100 });
  for (const booking of recent) {
    if (sameCustomerPhone(booking.mobileNumber, phone)) {
      byRef.set(booking.paymentReference, booking);
    }
  }
  return [...byRef.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function recordHowHeardFromWhatsApp(input: {
  store: KVNamespace;
  phone: string;
  option: HowHeardOption;
}): Promise<HowHeardRecordResult> {
  const candidates = await candidateBookingsForPhone(input.store, input.phone);
  const booking = candidates[0];
  if (!booking) return { ok: false, reason: "no_booking" };

  if (booking.howHeardSource) {
    return { ok: true, booking, alreadyRecorded: true };
  }

  const next: PaidBookingRecord = {
    ...booking,
    howHeardSource: input.option.key,
    howHeardSourceLabel: input.option.label,
    howHeardRecordedAt: new Date().toISOString(),
    howHeardChannel: "whatsapp",
  };

  try {
    await savePaidBookingRecord(input.store, next);
    const saved = await getPaidBookingRecord(input.store, next.paymentReference);
    return { ok: true, booking: saved ?? next, alreadyRecorded: false };
  } catch {
    return { ok: false, reason: "save_failed" };
  }
}
