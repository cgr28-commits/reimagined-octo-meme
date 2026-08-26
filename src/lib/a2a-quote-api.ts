import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type { BookingDetails } from "@/lib/booking-message";

const WORKER_BASE = resolveWorkerBaseUrl();

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

export async function fetchOwnerA2aQuotes(ownerKey: string): Promise<A2aQuoteOwnerSummary[]> {
  const response = await fetch(`${WORKER_BASE}/owner/a2a-quotes`, {
    headers: {
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    quotes?: A2aQuoteOwnerSummary[];
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(String(payload?.error || "Could not load A2A quotes"));
  }
  return Array.isArray(payload?.quotes) ? payload!.quotes! : [];
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
