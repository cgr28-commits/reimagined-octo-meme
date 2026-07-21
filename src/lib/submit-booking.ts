import { SITE } from "@/lib/data";
import type { BookingDetails } from "@/lib/booking-message";
import { buildBookingMessage } from "@/lib/booking-message";

export type EnquirySubmission = {
  customerName: string;
  message: string;
  subject?: string;
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
    throw new Error(`Worker booking API failed (${response.status})`);
  }
}

async function submitViaWeb3Forms(submission: EnquirySubmission): Promise<void> {
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
}

async function submitViaFormSubmitAjax(submission: EnquirySubmission): Promise<void> {
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
        _template: "table",
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
}

function submitViaFormSubmitForm(submission: EnquirySubmission): Promise<void> {
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
      _template: "table",
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
      resolve();
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
      resolve();
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

async function submitViaFormSubmit(submission: EnquirySubmission): Promise<void> {
  try {
    await submitViaFormSubmitAjax(submission);
  } catch {
    await submitViaFormSubmitForm(submission);
  }
}

export async function submitEnquiryByEmail(submission: EnquirySubmission): Promise<void> {
  const attempts: Array<{ label: string; run: () => Promise<void> }> = [];

  if (BOOKINGS_API_URL) {
    attempts.push({ label: "worker", run: () => submitViaWorker(submission) });
  }

  if (WEB3FORMS_ACCESS_KEY) {
    attempts.push({ label: "web3forms", run: () => submitViaWeb3Forms(submission) });
  }

  attempts.push({ label: "formsubmit", run: () => submitViaFormSubmit(submission) });

  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      await attempt.run();
      return;
    } catch (error) {
      lastError = error;
      console.error(`Booking submission via ${attempt.label} failed`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Booking email could not be sent");
}

export async function submitBookingByEmail(details: BookingDetails): Promise<void> {
  const message = buildBookingMessage(details);

  await submitEnquiryByEmail({
    customerName: details.customerName,
    message,
    subject: `New booking — ${details.customerName}`,
  });
}
