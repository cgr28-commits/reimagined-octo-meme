import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type { BookingDetails } from "@/lib/booking-message";

const WORKER_BASE = resolveWorkerBaseUrl();

export type A2aQuoteOwnerFilter =
  | "awaiting"
  | "approved"
  | "paid"
  | "expired"
  | "cancelled"
  | "history"
  | "all";

export type A2aQuoteOwnerSummary = {
  reference: string;
  status: string;
  statusLabel: string;
  customerName: string;
  customerEmail: string;
  customerMobile: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  returnJourney: boolean;
  returnDate?: string;
  returnTime?: string;
  passengers: number;
  suitcases: number;
  vehicle: string;
  journeyDistance?: string | null;
  journeyDuration?: string | null;
  tripLabel: string;
  createdAt: string;
  updatedAt: string;
  quotedPrice: number | null;
  quotedPriceLabel: string | null;
  quoteApprovedAt: string | null;
  quoteValidityMinutes: number | null;
  quoteValidityLabel: string | null;
  quoteExpiresAt: string | null;
  paymentUrl: string | null;
  paymentReference: string | null;
  paidAt: string | null;
  paymentLinkEmailSentAt: string | null;
  payable: boolean;
};

export type PublicA2aQuoteSummary = {
  reference: string;
  status: string;
  statusLabel: string;
  amount: number | null;
  amountLabel: string | null;
  customerName: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  returnJourney: boolean;
  returnDate?: string;
  returnTime?: string;
  passengers: number;
  suitcases: number;
  vehicle: string;
  quoteExpiresAt: string | null;
  quoteValidityMinutes: number | null;
  quoteValidityLabel: string | null;
  paymentUrl: string | null;
  payable: boolean;
  expired: boolean;
  expiredMessage: string | null;
};

export async function createA2aQuoteRequest(
  booking: BookingDetails,
): Promise<{ reference: string; status: string }> {
  const response = await fetch(`${WORKER_BASE}/a2a-quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ booking }),
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    reference?: string;
    status?: string;
    error?: string;
  } | null;
  if (!response.ok || !payload?.reference) {
    throw new Error(String(payload?.error || "Could not save quote request"));
  }
  return { reference: payload.reference, status: String(payload.status || "AWAITING_QUOTE") };
}

export async function fetchOwnerA2aQuotes(
  ownerKey: string,
  filter: A2aQuoteOwnerFilter = "awaiting",
): Promise<{ quotes: A2aQuoteOwnerSummary[]; awaitingCount: number }> {
  const url = new URL(`${WORKER_BASE}/owner/a2a-quotes`);
  url.searchParams.set("filter", filter);
  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    quotes?: A2aQuoteOwnerSummary[];
    awaitingCount?: number;
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(String(payload?.error || "Could not load A2A quotes"));
  }
  return {
    quotes: Array.isArray(payload?.quotes) ? payload!.quotes! : [],
    awaitingCount:
      typeof payload?.awaitingCount === "number" && Number.isFinite(payload.awaitingCount)
        ? Math.max(0, Math.floor(payload.awaitingCount))
        : 0,
  };
}

export async function updateOwnerA2aQuoteJourney(
  ownerKey: string,
  input: {
    reference: string;
    pickupLabel: string;
    dropoffLabel: string;
    tripDate: string;
    tripTime: string;
    returnJourney?: boolean;
    returnDate?: string;
    returnTime?: string;
    journeyDistance?: string;
    journeyDuration?: string;
  },
): Promise<A2aQuoteOwnerSummary> {
  const response = await fetch(`${WORKER_BASE}/owner/a2a-quotes/update-journey`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({
      key: ownerKey.trim(),
      ...input,
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    record?: A2aQuoteOwnerSummary;
    error?: string;
  } | null;
  if (!response.ok || !payload?.record) {
    throw new Error(String(payload?.error || "Could not save journey changes"));
  }
  return payload.record;
}

export async function approveOwnerA2aQuote(
  ownerKey: string,
  input: { reference: string; quotedPrice: number; validityMinutes: number },
): Promise<{
  record: A2aQuoteOwnerSummary;
  payUrl: string;
  paymentEmailSent: boolean;
  paymentEmailError?: string;
}> {
  const response = await fetch(`${WORKER_BASE}/owner/a2a-quotes/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({
      key: ownerKey.trim(),
      reference: input.reference,
      quotedPrice: input.quotedPrice,
      validityMinutes: input.validityMinutes,
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    record?: A2aQuoteOwnerSummary;
    payUrl?: string;
    paymentEmailSent?: boolean;
    paymentEmailError?: string;
    error?: string;
  } | null;
  if (!response.ok || !payload?.record || !payload.payUrl) {
    throw new Error(String(payload?.error || "Could not approve quote"));
  }
  return {
    record: payload.record,
    payUrl: payload.payUrl,
    paymentEmailSent: Boolean(payload.paymentEmailSent),
    ...(payload.paymentEmailError ? { paymentEmailError: payload.paymentEmailError } : {}),
  };
}

export async function resendOwnerA2aPaymentEmail(
  ownerKey: string,
  reference: string,
): Promise<{
  record: A2aQuoteOwnerSummary;
  payUrl: string;
  paymentEmailSent: true;
}> {
  const response = await fetch(`${WORKER_BASE}/owner/a2a-quotes/resend-payment-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({
      key: ownerKey.trim(),
      reference: reference.trim(),
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    record?: A2aQuoteOwnerSummary;
    payUrl?: string;
    paymentEmailSent?: boolean;
    error?: string;
  } | null;
  if (!response.ok || !payload?.record || !payload.payUrl || !payload.paymentEmailSent) {
    throw new Error(String(payload?.error || "Could not resend payment email"));
  }
  return {
    record: payload.record,
    payUrl: payload.payUrl,
    paymentEmailSent: true,
  };
}

export async function fetchPublicA2aQuote(token: string): Promise<PublicA2aQuoteSummary> {
  const response = await fetch(
    `${WORKER_BASE}/a2a-quotes/by-token?token=${encodeURIComponent(token.trim())}`,
    { headers: { Accept: "application/json" } },
  );
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    quote?: PublicA2aQuoteSummary;
    error?: string;
  } | null;
  if (!response.ok || !payload?.quote) {
    throw new Error(String(payload?.error || "Could not load quote"));
  }
  return payload.quote;
}
