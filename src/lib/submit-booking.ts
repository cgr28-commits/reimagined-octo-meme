import { SITE } from "@/lib/data";
import type { BookingDetails } from "@/lib/booking-message";
import { buildBookingMessage } from "@/lib/booking-message";
import type { TourEnquiryDetails } from "@/lib/tour-enquiry-message";
import { buildTourEnquiryMessage } from "@/lib/tour-enquiry-message";

export type CalendarConflict = {
  label: string;
  start: string;
  end: string;
  overlappingEvents: Array<{
    summary: string;
    start: string;
    end: string;
  }>;
};

export type BookingSubmissionResult = {
  calendar?: {
    configured: boolean;
    eventsCreated: number;
    conflicts: CalendarConflict[];
  };
};

export type EnquirySubmission = {
  customerName: string;
  message: string;
  subject?: string;
  booking?: StructuredBookingPayload;
};

type StructuredBookingPayload = {
  customerName: string;
  customerEmail?: string;
  mobileNumber?: string;
  tripLabel: string;
  pickupLabel: string;
  dropoffLabel: string;
  returnJourney?: boolean;
  tripDate: string;
  tripTime: string;
  returnDate?: string;
  returnTime?: string;
  flightNumber?: string;
  passengers?: number;
  suitcases?: number;
  vehicle?: string;
  estimatedPrice?: string | null;
  isAirportTrip?: boolean;
  bookingType?: "transfer" | "day-trip";
  tourTitle?: string;
  notes?: string;
};

const WEB3FORMS_ACCESS_KEY =
  process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY?.trim() ?? "";

function resolveBookingsApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    // GitHub Pages is static — POST routes like /api/bookings return 405.
    if (host === "www.myairporttaxini.co.uk" || host === "myairporttaxini.co.uk") {
      return "";
    }
  } catch {
    return "";
  }

  return url;
}

const BOOKINGS_API_URL = resolveBookingsApiUrl();

function isSuccessfulPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const success = (payload as { success?: unknown }).success;
  return success === true || success === "true";
}

function readBookingReference(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const bookingReference = (payload as { bookingReference?: unknown }).bookingReference;
  return typeof bookingReference === "string" ? bookingReference.trim() : "";
}

async function submitViaWorker(submission: EnquirySubmission): Promise<string> {
  const response = await fetch(BOOKINGS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      customerName: submission.customerName,
      message: submission.message,
      booking: submission.booking,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Worker booking API failed (${response.status})`);
  }

  return readBookingReference(payload);
}

async function submitViaWeb3Forms(submission: EnquirySubmission): Promise<string> {
  if (!WEB3FORMS_ACCESS_KEY) {
    throw new Error("Web3Forms is not configured");
  }

  const response = await fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      access_key: WEB3FORMS_ACCESS_KEY,
      subject: submission.subject ?? `New enquiry — ${submission.customerName}`,
      from_name: submission.customerName,
      message: submission.message,
    }),
  });

  if (!response.ok) {
    throw new Error(`Web3Forms failed (${response.status})`);
  }

  const payload = await response.json();
  if (!isSuccessfulPayload(payload)) {
    throw new Error("Web3Forms rejected the submission");
  }

  return "";
}

async function submitViaFormSubmitAjax(submission: EnquirySubmission): Promise<string> {
  const response = await fetch(
    `https://formsubmit.co/ajax/${encodeURIComponent(SITE.email)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        _subject: submission.subject ?? `New enquiry — ${submission.customerName}`,
        _captcha: "false",
        _template: "box",
        name: submission.customerName,
        message: submission.message,
      }),
    },
  );

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("FormSubmit returned an unexpected response");
  }

  const payload = await response.json();
  if (!response.ok || !isSuccessfulPayload(payload)) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message)
        : "FormSubmit rejected the submission";
    throw new Error(message);
  }

  return "";
}

function submitViaFormSubmitForm(submission: EnquirySubmission): Promise<string> {
  return new Promise((resolve, reject) => {
    const iframeName = `formsubmit-${Date.now()}`;
    const iframe = document.createElement("iframe");
    iframe.name = iframeName;
    iframe.style.display = "none";
    iframe.setAttribute("aria-hidden", "true");

    const form = document.createElement("form");
    form.method = "POST";
    form.action = `https://formsubmit.co/${encodeURIComponent(SITE.email)}`;
    form.target = iframeName;
    form.style.display = "none";

    const fields: Record<string, string> = {
      _subject: submission.subject ?? `New enquiry — ${submission.customerName}`,
      _captcha: "false",
      _template: "box",
      name: submission.customerName,
      message: submission.message,
    };

    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }

    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve("");
    }, 2500);

    function cleanup() {
      window.clearTimeout(timeout);
      form.remove();
      iframe.remove();
    }

    iframe.addEventListener("load", () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve("");
    });

    document.body.appendChild(iframe);
    document.body.appendChild(form);
    form.submit();

    window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error("FormSubmit timed out"));
    }, 10000);
  });
}

async function submitViaFormSubmit(submission: EnquirySubmission): Promise<string> {
  try {
    return await submitViaFormSubmitAjax(submission);
  } catch {
    return submitViaFormSubmitForm(submission);
  }
}

export async function submitEnquiryByEmail(
  submission: EnquirySubmission,
  options?: { allowFormSubmitFallback?: boolean },
): Promise<string> {
  const allowFormSubmitFallback = options?.allowFormSubmitFallback ?? true;
  const attempts: Array<{ label: string; run: () => Promise<string> }> = [];

  if (BOOKINGS_API_URL) {
    attempts.push({ label: "worker", run: () => submitViaWorker(submission) });
  }

  if (WEB3FORMS_ACCESS_KEY) {
    attempts.push({ label: "web3forms", run: () => submitViaWeb3Forms(submission) });
  }

  if (allowFormSubmitFallback) {
    attempts.push({ label: "formsubmit", run: () => submitViaFormSubmit(submission) });
  } else {
    attempts.push({ label: "formsubmit-ajax", run: () => submitViaFormSubmitAjax(submission) });
  }

  let lastError: unknown = null;
  let calendarResult: BookingSubmissionResult = {};

  for (const attempt of attempts) {
    try {
      return await attempt.run();
    } catch (error) {
      lastError = error;
      console.error(`Booking submission via ${attempt.label} failed`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Booking email could not be sent");
}

export async function submitBookingByEmail(details: BookingDetails): Promise<string> {
  const message = buildBookingMessage(details);

  return submitEnquiryByEmail(
    {
      customerName: details.customerName,
      message,
      subject: `New booking — ${details.customerName}`,
    },
    { allowFormSubmitFallback: false },
  );
}

export async function submitDayTripByEmail(
  details: TourEnquiryDetails,
): Promise<BookingSubmissionResult> {
  const message = buildTourEnquiryMessage(details);

  return submitEnquiryByEmail({
    customerName: details.customerName,
    message,
    subject: `New day trip booking — ${details.customerName}`,
    booking: toStructuredDayTrip(details),
  });
}

export function formatCalendarConflictWarning(conflicts: CalendarConflict[]): string {
  if (conflicts.length === 0) {
    return "";
  }

  const lines = conflicts.map((conflict) => {
    const overlapText =
      conflict.overlappingEvents.length > 0
        ? conflict.overlappingEvents.map((event) => event.summary).join(", ")
        : "another booking";
    return `${conflict.label} overlaps with ${overlapText}.`;
  });

  return `Calendar note: ${lines.join(" ")} We'll review and confirm shortly.`;
}
