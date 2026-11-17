import { assertPreviewNotificationsAllowed } from "@/lib/preview-notifications";
import { resolveBookingsApiUrl } from "@/lib/worker-api";

/**
 * Email contact page (/contact/email/, owner 17 Nov 2026): a customer's message, sent to the
 * bookings inbox through the existing owner-inbox route (the same one the desktop quote
 * enquiry uses). No booking, payment or calendar entry is created, and no new backend route.
 */
export type ContactMessage = {
  name: string;
  email: string;
  /** Optional: an existing booking the message is about. */
  bookingReference: string;
  message: string;
};

export type ContactMessageField = "name" | "email" | "bookingReference" | "message";

export const CONTACT_MESSAGE_MIN_LENGTH = 10;
export const CONTACT_MESSAGE_MAX_LENGTH = 2000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** First problem with the form, or null when it can be sent. */
export function validateContactMessage(
  input: ContactMessage,
): { field: ContactMessageField; error: string } | null {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) {
    return { field: "name", error: "Enter your name (2–80 characters)." };
  }
  const email = input.email.trim();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { field: "email", error: "Enter a valid email address, so we can reply to you." };
  }
  if (input.bookingReference.trim().length > 40) {
    return { field: "bookingReference", error: "Keep the booking reference under 40 characters." };
  }
  const message = input.message.trim();
  if (message.length < CONTACT_MESSAGE_MIN_LENGTH) {
    return { field: "message", error: "Tell us a little more, so we can help." };
  }
  if (message.length > CONTACT_MESSAGE_MAX_LENGTH) {
    return {
      field: "message",
      error: `Keep your message under ${CONTACT_MESSAGE_MAX_LENGTH.toLocaleString("en-GB")} characters.`,
    };
  }
  return null;
}

/** The plain-text email the owner receives. */
export function contactMessageEmailBody(input: ContactMessage): string {
  const reference = input.bookingReference.trim();
  return [
    "WEBSITE CONTACT FORM — a message from the Contact page. Not a booking.",
    [
      `Name: ${input.name.trim()}`,
      `Reply to: ${input.email.trim()}`,
      ...(reference ? [`Booking reference: ${reference}`] : []),
    ].join("\n"),
    `Message:\n${input.message.trim()}`,
    "Please reply to the customer at the email address above. No booking or payment has been made.",
  ].join("\n\n");
}

export const CONTACT_MESSAGE_SEND_FAILED =
  "We couldn't send your message. Please try again in a moment, or email us directly.";

/** Sends the message to the bookings inbox. Throws with a customer-friendly message on failure. */
export async function sendContactMessage(
  input: ContactMessage,
  request: typeof fetch = fetch,
): Promise<void> {
  const invalid = validateContactMessage(input);
  if (invalid) throw new Error(invalid.error);
  assertPreviewNotificationsAllowed();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await request(resolveBookingsApiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        // Shown in the owner's email subject, so it reads as a message, not a booking request.
        customerName: `${input.name.trim()} (website message)`,
        sendEmail: true,
        message: contactMessageEmailBody(input),
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true || result?.emailSent !== true) {
      throw new Error(CONTACT_MESSAGE_SEND_FAILED);
    }
  } finally {
    clearTimeout(timeout);
  }
}
