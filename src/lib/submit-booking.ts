import { SITE } from "@/lib/data";
import type { BookingDetails } from "@/lib/booking-message";
import { buildBookingMessage } from "@/lib/booking-message";

const BOOKINGS_API_URL = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";

export type EnquirySubmission = {
  customerName: string;
  message: string;
  subject?: string;
};

async function submitViaWorker(submission: EnquirySubmission): Promise<void> {
  const response = await fetch(BOOKINGS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      customerName: submission.customerName,
      message: submission.message,
    }),
  });

  if (!response.ok) {
    throw new Error("Booking email could not be sent");
  }
}

async function submitViaFormSubmit(submission: EnquirySubmission): Promise<void> {
  const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(SITE.email)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      _subject: submission.subject ?? `New enquiry — ${submission.customerName}`,
      _captcha: "false",
      _template: "box",
      message: submission.message,
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

export async function submitEnquiryByEmail(submission: EnquirySubmission): Promise<void> {
  if (BOOKINGS_API_URL) {
    await submitViaWorker(submission);
    return;
  }

  await submitViaFormSubmit(submission);
}

export async function submitBookingByEmail(details: BookingDetails): Promise<void> {
  const message = buildBookingMessage(details);

  await submitEnquiryByEmail({
    customerName: details.customerName,
    message,
    subject: `New booking — ${details.customerName}`,
  });
}
