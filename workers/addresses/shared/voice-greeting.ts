/**
 * Opening greeting for the phone receptionist — Europe/London (NI), including DST.
 * Full business name is used once here only; later turns use we/us/our.
 */

export type VoiceDayPart = "morning" | "afternoon" | "evening";

export const VOICE_BUSINESS_NAME = "My Airport Taxi NI";

/** London local hour 0–23 (handles BST/GMT automatically via Europe/London). */
export function londonHourNow(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return Number(parts.find((p) => p.type === "hour")?.value ?? "12");
}

export function voiceDayPart(now = new Date()): VoiceDayPart {
  const hour = londonHourNow(now);
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function dayPartLabel(part: VoiceDayPart): string {
  return part === "morning" ? "Good morning" : part === "afternoon" ? "Good afternoon" : "Good evening";
}

/**
 * Single opening line with the full business name once.
 * Optional first name from inbound context (never invent one).
 */
export function voiceOpeningGreeting(input: { firstName?: string; now?: Date } = {}): {
  dayPart: VoiceDayPart;
  greeting: string;
} {
  const dayPart = voiceDayPart(input.now);
  const hello = dayPartLabel(dayPart);
  const name = String(input.firstName ?? "")
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^A-Za-z'-]/g, "")
    .slice(0, 40);
  const greeting = name
    ? `${hello}, ${VOICE_BUSINESS_NAME} — hello ${name}. How can we help?`
    : `${hello}, ${VOICE_BUSINESS_NAME}. How can we help?`;
  return { dayPart, greeting };
}

/**
 * After WhatsApp/SMS was accepted for sending (not handset delivery proof).
 * Keep this customer-facing — no internal policy about driver assignment.
 */
export const VOICE_LINK_SENT_SAY =
  "That's grand. We've sent you a secure link where you can check the details and complete your booking.";

/** Short customer line after sending the link — booking confirms on payment; driver details come later. */
export const VOICE_BOOKING_AFTER_PAYMENT_SAY =
  "Once you've paid on that link, your booking is confirmed, and your driver details follow closer to pickup.";

/** Spoken when the caller asked for a text (SMS), after Fonio Send SMS accepts it. */
export const VOICE_LINK_SENT_SMS_SAY =
  "That's grand. We've texted you a secure link where you can check the details and complete your booking.";

/** Spoken when the caller asked for WhatsApp. */
export const VOICE_LINK_SENT_WHATSAPP_SAY =
  "That's grand. We've sent you a WhatsApp with a secure link where you can check the details and complete your booking.";

/** Spoken cancellation policy — aligned with shared/cancellation-policy.ts. */
export const VOICE_CANCELLATION_SAY =
  "You can cancel more than 24 hours before pickup for a full refund. Cancellations within 24 hours of pickup are non-refundable.";

/** SMS / WhatsApp link pipeline statuses for Fonio (customer wording must match). */
export type VoiceLinkMessageStatus = "generated" | "accepted" | "delivered";
