import type { PaidBookingRecord } from "../../shared/paid-booking-record";

const DEFAULT_WORKER_BASE = "https://reimagined-octo-meme.cgr28.workers.dev";

function resolveWorkerBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";
  if (!configured) {
    return DEFAULT_WORKER_BASE;
  }
  try {
    const parsed = new URL(configured);
    const host = parsed.hostname.toLowerCase();
    if (host === "www.myairporttaxini.co.uk" || host === "myairporttaxini.co.uk") {
      return DEFAULT_WORKER_BASE;
    }
    return configured.replace(/\/bookings\/?$/i, "");
  } catch {
    return DEFAULT_WORKER_BASE;
  }
}

const WORKER_BASE = resolveWorkerBaseUrl();

export type OwnerPaidBookingSummary = Pick<
  PaidBookingRecord,
  | "paymentReference"
  | "checkoutId"
  | "createdAt"
  | "status"
  | "customerName"
  | "customerEmail"
  | "mobileNumber"
  | "tripLabel"
  | "pickupLabel"
  | "dropoffLabel"
  | "tripDate"
  | "tripTime"
  | "returnJourney"
  | "returnDate"
  | "returnTime"
> & {
  amountPaid: string;
};

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  return ((await response.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
}

export async function fetchOwnerPaidBookings(
  ownerKey: string,
  options?: { days?: number; limit?: number },
): Promise<OwnerPaidBookingSummary[]> {
  const days = options?.days ?? 30;
  const limit = options?.limit ?? 50;
  const response = await fetch(
    `${WORKER_BASE}/paid-bookings?days=${encodeURIComponent(String(days))}&limit=${encodeURIComponent(String(limit))}`,
    {
      headers: {
        Accept: "application/json",
        "X-Owner-Key": ownerKey.trim(),
      },
    },
  );
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error ?? "Failed to load paid bookings"));
  }
  return Array.isArray(payload.bookings)
    ? (payload.bookings as OwnerPaidBookingSummary[])
    : [];
}

export type ResendPaidConfirmationResult = {
  ok: boolean;
  paymentReference: string;
  customerEmail: string;
  customerEmailSent: boolean;
  ownerEmailSent?: boolean;
  customerEmailError?: string;
  tripLabel?: string;
  amountPaid?: string;
};

export async function resendPaidBookingConfirmation(
  ownerKey: string,
  paymentReference: string,
): Promise<ResendPaidConfirmationResult> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/resend-confirmation`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({ paymentReference }),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error ?? "Failed to resend confirmation"));
  }
  return {
    ok: payload.ok === true,
    paymentReference: String(payload.paymentReference ?? paymentReference),
    customerEmail: String(payload.customerEmail ?? ""),
    customerEmailSent: payload.customerEmailSent === true,
    ownerEmailSent: payload.ownerEmailSent === true,
    customerEmailError:
      typeof payload.customerEmailError === "string" ? payload.customerEmailError : undefined,
    tripLabel: typeof payload.tripLabel === "string" ? payload.tripLabel : undefined,
    amountPaid: typeof payload.amountPaid === "string" ? payload.amountPaid : undefined,
  };
}
