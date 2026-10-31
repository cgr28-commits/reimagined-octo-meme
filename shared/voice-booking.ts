/**
 * Phone assistant (fonio) — callers asking about a booking they already have.
 *
 * Privacy: details are only read out when the booking reference AND the mobile number on
 * the booking both match. With just a mobile number Olivia can confirm there is a booking
 * and send the details to that mobile (the number on the booking), but never reads them out.
 * Changes and cancellations always go through the customer's Manage Booking link.
 */
import { isCancelledBooking } from "./airport-pickup-reminder";
import { normalizeCustomerBookingReference } from "./customer-booking-reference";
import type { PaidBookingRecord } from "./paid-booking-record";
import { paidBookingPickupLeg, sameCustomerPhone, upcomingCustomerBookings } from "./whatsapp-pickup-info";

/** "MAT-1234", "mat 1234", "M A T one two three four" (digits only), "1234" → "MAT-1234". */
export function voiceBookingReference(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const direct = normalizeCustomerBookingReference(raw);
  if (direct) return direct;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 4 ? normalizeCustomerBookingReference(`MAT-${digits}`) : null;
}

/** UK/Irish mobile as spoken or typed → digits (with +), or null when it isn't a mobile. */
export function voiceMobile(value: unknown): string | null {
  const digits = String(value ?? "").replace(/[^\d+]/g, "");
  if (/^(\+?44|0)7\d{9}$/.test(digits)) return digits;
  if (/^(\+?353|0)8[3-9]\d{7}$/.test(digits)) return digits;
  return null;
}

/** "08:15" → "8:15am", "17:00" → "5pm", "00:30" → "12:30am". */
export function spokenTime(time: string | null | undefined): string {
  const m = String(time ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(time ?? "").trim();
  const h = Number(m[1]);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m[2] === "00" ? `${h12}${suffix}` : `${h12}:${m[2]}${suffix}`;
}

/** "2026-11-14" → "Saturday 14 November". */
export function spokenDate(date: string | null | undefined): string {
  const m = String(date ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(date ?? "").trim();
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  const month = d.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  return `${weekday} ${d.getUTCDate()} ${month}`;
}

/** First part of an address label: "12 Main Street, Bangor BT20" → "12 Main Street, Bangor". */
function place(label: string | null | undefined): string {
  const parts = String(label ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return parts.join(", ");
  return parts.slice(0, 2).join(", ");
}

export type VoiceBookingMatch =
  | { kind: "verified"; booking: PaidBookingRecord }
  | { kind: "mobile_only"; bookings: PaidBookingRecord[] }
  | { kind: "not_found" };

/**
 * Pick what can be shared. `byReference` is the booking the reference points at (if any);
 * `candidates` are recent/upcoming bookings to search by mobile when there is no reference.
 */
export function matchVoiceBooking(input: {
  reference: string | null;
  mobile: string;
  byReference: PaidBookingRecord | null;
  candidates: PaidBookingRecord[];
  now?: Date;
}): VoiceBookingMatch {
  if (input.reference) {
    // A reference that doesn't belong to this mobile looks exactly like no booking at all.
    if (input.byReference && sameCustomerPhone(input.byReference.mobileNumber, input.mobile)) {
      return { kind: "verified", booking: input.byReference };
    }
    return { kind: "not_found" };
  }
  const mine = input.candidates.filter((b) => sameCustomerPhone(b.mobileNumber, input.mobile));
  const upcoming = upcomingCustomerBookings(mine, input.now);
  return upcoming.length ? { kind: "mobile_only", bookings: upcoming } : { kind: "not_found" };
}

export type VoiceDriverInfo = { name?: string; onTheWay?: boolean } | null;

/** Spoken summary of a verified booking. Never mentions price, payment or surcharges. */
export function voiceBookingSay(booking: PaidBookingRecord, driver: VoiceDriverInfo, now: Date = new Date()): string {
  const outCancelled = isCancelledBooking(paidBookingPickupLeg(booking, "outbound"));
  const retCancelled = booking.returnJourney ? isCancelledBooking(paidBookingPickupLeg(booking, "return")) : true;
  const ref = booking.customerReference ? `booking ${booking.customerReference}` : "your booking";
  const first = String(booking.customerName ?? "").trim().split(/\s+/)[0];
  const opener = `I've found ${ref}${first ? ` for ${first}` : ""}.`;

  if (outCancelled && retCancelled) {
    return `${opener} That booking has been cancelled. If you'd like to book again I can get you a new price.`;
  }
  if (!upcomingCustomerBookings([booking], now).length) {
    return `${opener} That journey has already taken place. If there was a problem with it, I can take your details and the team will get back to you.`;
  }

  const parts = [opener];
  const leg = (date?: string, time?: string, from?: string, to?: string) =>
    `on ${spokenDate(date)} at ${spokenTime(time)}, from ${place(from)} to ${place(to)}`;
  if (booking.returnJourney) {
    parts.push(
      outCancelled
        ? "The outward journey was cancelled."
        : `The outward pickup is ${leg(booking.tripDate, booking.tripTime, booking.pickupLabel, booking.dropoffLabel)}.`,
      retCancelled
        ? "The return journey was cancelled."
        : `The return pickup is ${leg(booking.returnDate, booking.returnTime, booking.dropoffLabel, booking.pickupLabel)}.`,
    );
  } else {
    parts.push(`Your pickup is ${leg(booking.tripDate, booking.tripTime, booking.pickupLabel, booking.dropoffLabel)}.`);
  }
  if (booking.passengers) {
    parts.push(`It's booked for ${booking.passengers} ${booking.passengers === 1 ? "passenger" : "passengers"}.`);
  }
  parts.push("It's all confirmed.");
  if (driver?.onTheWay) {
    parts.push(driver.name ? `${driver.name}, your driver, is on the way.` : "Your driver is on the way.");
  } else if (driver?.name) {
    parts.push(`Your driver will be ${driver.name}.`);
  }
  parts.push("If you need to change or cancel anything, I can send you your Manage Booking link.");
  return parts.join(" ");
}

export function voiceMobileOnlySay(count: number): string {
  const found = count === 1 ? "an upcoming booking" : `${count} upcoming bookings`;
  return (
    `I can see ${found} on that mobile number. For your security I can't read the details out without the booking reference, ` +
    "which starts M-A-T and is in your confirmation email. Or I can send the details to that mobile now – would you like that?"
  );
}

export const VOICE_BOOKING_NOT_FOUND_SAY =
  "I couldn't find a booking with those details. Could you check the booking reference in your confirmation email – it starts M-A-T – " +
  "and the mobile number you booked with? Or I can take your details and the team will get back to you.";

/** Text message with the booking details and Manage Booking link (SMS backup to WhatsApp). */
export function voiceBookingSmsText(booking: PaidBookingRecord, manageUrl: string | null): string {
  const ref = booking.customerReference ? ` ${booking.customerReference}` : "";
  const when = `${spokenDate(booking.tripDate)} at ${spokenTime(booking.tripTime)}`;
  const link = manageUrl ? ` To view, change or cancel it: ${manageUrl}` : " Reply on WhatsApp to 07549 815538 if you need to change it.";
  return `My Airport Taxi NI: your booking${ref} – pickup ${when} from ${place(booking.pickupLabel)} to ${place(booking.dropoffLabel)}.${link}`;
}
