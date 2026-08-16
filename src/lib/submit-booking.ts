import { SITE } from "@/lib/data";
import type { BookingDetails } from "@/lib/booking-message";
import { buildBookingMessage } from "@/lib/booking-message";

import type { TourEnquiryDetails } from "@/lib/tour-enquiry-message";

export type EnquirySubmission = {
  customerName: string;
  message: string;
  subject?: string;
  sendEmail?: boolean;
  booking?: BookingDetails;
  tour?: TourEnquiryDetails;
  /** Optional honeypot — must stay empty. */
  companyWebsite?: string;
};

function resolveBookingsApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host === "www.myairporttaxini.co.uk" || host === "myairporttaxini.co.uk") {
      return "";
    }
  } catch {
    return "";
  }

  return url;
}

const BOOKINGS_API_URL = resolveBookingsApiUrl();

/** Relative Next.js booking API (available on Vercel / `next start`, not GitHub Pages export). */
const NEXT_BOOKING_API = "/api/booking";

function readBookingReference(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const bookingReference = (payload as { bookingReference?: unknown }).bookingReference;
  return typeof bookingReference === "string" ? bookingReference.trim() : "";
}

type SubmitResult = {
  bookingReference: string;
  emailSent: boolean;
};

function isSpamSubmission(submission: EnquirySubmission): boolean {
  return Boolean(submission.companyWebsite?.trim());
}

async function submitViaWorker(submission: EnquirySubmission): Promise<SubmitResult> {
  if (!BOOKINGS_API_URL) {
    throw new Error("Bookings API is not configured");
  }

  const response = await fetch(BOOKINGS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      customerName: submission.customerName,
      message: submission.message,
      sendEmail: submission.sendEmail !== false,
      booking: submission.booking,
      tour: submission.tour,
      companyWebsite: submission.companyWebsite ?? "",
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    success?: boolean;
    bookingReference?: string;
    emailSent?: boolean;
    error?: string;
  } | null;

  if (payload?.ok || payload?.success) {
    return {
      bookingReference: readBookingReference(payload),
      emailSent: payload.emailSent === true || submission.sendEmail === false,
    };
  }

  throw new Error(
    payload?.error ??
      (response.ok
        ? "Unable to submit booking. Please try again."
        : `Unable to submit booking. Please try again.`),
  );
}

async function submitViaNextApi(submission: EnquirySubmission): Promise<SubmitResult> {
  const response = await fetch(NEXT_BOOKING_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      customerName: submission.customerName,
      message: submission.message,
      subject: submission.subject,
      sendEmail: submission.sendEmail !== false,
      booking: submission.booking,
      tour: submission.tour,
      companyWebsite: submission.companyWebsite ?? "",
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    bookingReference?: string;
    error?: string;
  } | null;

  if (payload?.success) {
    return {
      bookingReference: readBookingReference(payload),
      emailSent: submission.sendEmail !== false,
    };
  }

  throw new Error(payload?.error ?? "Unable to submit booking. Please try again.");
}

/**
 * Submit a booking/enquiry to the server-side API (Cloudflare Worker or Next.js).
 * FormSubmit / browser third-party form posts have been removed.
 */
export async function submitEnquiryByEmail(
  submission: EnquirySubmission,
): Promise<string> {
  if (isSpamSubmission(submission)) {
    // Silent success for bots — do not reveal honeypot behaviour.
    return "";
  }

  let lastError: unknown = null;

  if (BOOKINGS_API_URL) {
    try {
      const workerResult = await submitViaWorker(submission);
      if (workerResult.emailSent || submission.sendEmail === false) {
        return workerResult.bookingReference;
      }
      console.error("Worker accepted booking without sending email");
      lastError = new Error("Unable to submit booking. Please try again.");
    } catch (error) {
      lastError = error;
      console.error("Booking submission via worker failed", error);
    }
  }

  // Next.js App Router route — used in local/Vercel non-static deployments.
  try {
    const nextResult = await submitViaNextApi(submission);
    return nextResult.bookingReference;
  } catch (error) {
    lastError = error;
    console.error("Booking submission via Next API failed", error);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to submit booking. Please try again.");
}

export async function submitBookingByEmail(details: BookingDetails): Promise<string> {
  return submitEnquiryByEmail({
    customerName: details.customerName,
    message: buildBookingMessage(details),
    subject: `New booking — ${details.customerName}`,
    booking: details,
  });
}

/** Mobile WhatsApp path — log to worker/calendar without requiring owner email. */
export async function submitMobileWhatsAppBooking(details: BookingDetails): Promise<string> {
  const submission: EnquirySubmission = {
    customerName: details.customerName,
    message: buildBookingMessage(details),
    subject: `New booking — ${details.customerName}`,
    booking: details,
    sendEmail: false,
  };

  if (BOOKINGS_API_URL) {
    try {
      const result = await submitViaWorker(submission);
      return result.bookingReference;
    } catch (error) {
      console.error("Mobile WhatsApp worker log failed", error);
    }
  }

  return "";
}

export async function submitMobileWhatsAppEnquiry(submission: EnquirySubmission): Promise<string> {
  if (BOOKINGS_API_URL) {
    try {
      const result = await submitViaWorker({ ...submission, sendEmail: false });
      return result.bookingReference;
    } catch (error) {
      console.error("Mobile WhatsApp worker log failed", error);
    }
  }

  return "";
}

export function openWhatsAppBookingMessage(message: string): void {
  const url = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(message)}`;
  window.location.assign(url);
}
