import { SITE } from "@/lib/data";
import type { BookingDetails } from "@/lib/booking-message";
import { buildBookingMessage } from "@/lib/booking-message";

const BOOKINGS_API_URL = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";

async function submitViaWorker(message: string, details: BookingDetails): Promise<void> {
  const response = await fetch(BOOKINGS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      customerName: details.customerName,
      message,
    }),
  });

  if (!response.ok) {
    throw new Error("Booking email could not be sent");
  }
}

async function submitViaFormSubmit(message: string, details: BookingDetails): Promise<void> {
  const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(SITE.email)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      _subject: `New booking — ${details.customerName}`,
      _captcha: "false",
      _template: "box",
      message,
    }),
  });

  if (!response.ok) {
    throw new Error("Booking email could not be sent");
  }

  const payload = (await response.json()) as { success?: string };
  if (payload.success !== "true") {
    throw new Error("Booking email could not be sent");
  }
}

export async function submitBookingByEmail(details: BookingDetails): Promise<void> {
  const message = buildBookingMessage(details);

  if (BOOKINGS_API_URL) {
    await submitViaWorker(message, details);
    return;
  }

  await submitViaFormSubmit(message, details);
}
