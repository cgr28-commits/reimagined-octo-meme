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

type WorkerSubmitResult = {
  bookingReference: string;
  emailSent: boolean;
};

async function submitViaWorker(submission: EnquirySubmission): Promise<WorkerSubmitResult> {
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
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    bookingReference?: string;
    emailSent?: boolean;
    error?: string;
  } | null;

  if (payload?.ok) {
    return {
      bookingReference: readBookingReference(payload),
      emailSent: payload.emailSent === true || submission.sendEmail === false,
    };
  }

  if (!response.ok) {
    throw new Error(payload?.error ?? `Worker booking API failed (${response.status})`);
  }

  throw new Error(payload?.error ?? "Worker booking API rejected the submission");
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
  let bookingReference = "";
  let lastError: unknown = null;

  if (BOOKINGS_API_URL) {
    try {
      const workerResult = await submitViaWorker(submission);
      bookingReference = workerResult.bookingReference;
      if (workerResult.emailSent) {
        return bookingReference;
      }
      // Worker saved the booking but could not email — fall through to browser providers.
      console.error("Worker accepted booking without sending email; trying browser email providers");
    } catch (error) {
      lastError = error;
      console.error("Booking submission via worker failed", error);
    }
  }

  if (submission.sendEmail !== false) {
    const emailAttempts: Array<{ label: string; run: () => Promise<string> }> = [];

    if (WEB3FORMS_ACCESS_KEY) {
      emailAttempts.push({ label: "web3forms", run: () => submitViaWeb3Forms(submission) });
    }

    if (allowFormSubmitFallback) {
      emailAttempts.push({ label: "formsubmit", run: () => submitViaFormSubmit(submission) });
    } else {
      emailAttempts.push({ label: "formsubmit-ajax", run: () => submitViaFormSubmitAjax(submission) });
    }

    for (const attempt of emailAttempts) {
      try {
        await attempt.run();
        return bookingReference;
      } catch (error) {
        lastError = error;
        console.error(`Booking submission via ${attempt.label} failed`, error);
      }
    }
  }

  // Booking may already be stored on the worker even if every email path failed.
  if (bookingReference) {
    return bookingReference;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Booking email could not be sent");
}

export async function submitBookingByEmail(details: BookingDetails): Promise<string> {
  return submitEnquiryByEmail(
    {
      customerName: details.customerName,
      message: buildBookingMessage(details),
      subject: `New booking — ${details.customerName}`,
      booking: details,
    },
    // Prefer browser FormSubmit when the worker IP is rate-limited.
    { allowFormSubmitFallback: true },
  );
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
