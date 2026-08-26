import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type { PersonalQuotePublicSummary } from "../../shared/personal-quote";

const WORKER_BASE = resolveWorkerBaseUrl();

export type { PersonalQuotePublicSummary };

export type PersonalQuoteOwnerView = PersonalQuotePublicSummary & {
  customerEmail?: string;
  customerMobile?: string;
  notes?: string;
  active: boolean;
  createdAt: string;
  usedAt?: string;
  associatedPaymentReference?: string;
  associatedCheckoutId?: string;
  redeemable?: boolean;
  agreedAmount: number;
  amountLabel: string;
  singleUse: boolean;
  expiresOn: string;
  customerName: string;
  code: string;
  standardWebsiteAmount?: number;
  discountAmount?: number;
  pickupLabel?: string;
  dropoffLabel?: string;
  customerToken?: string;
  customerLink?: string;
};

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return {};
  }
  return payload as Record<string, unknown>;
}

/** Public validate — does not consume the quote. */
export async function validatePersonalQuoteCode(
  code: string,
): Promise<PersonalQuotePublicSummary> {
  const response = await fetch(`${WORKER_BASE}/personal-quotes/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ code }),
    cache: "no-store",
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(
      String(
        payload.error ||
          "We couldn’t apply that quote code. Please check the code or contact My Airport Taxi NI.",
      ),
    );
  }
  const quote = payload.quote;
  if (!quote || typeof quote !== "object") {
    throw new Error(
      "We couldn’t apply that quote code. Please check the code or contact My Airport Taxi NI.",
    );
  }
  return quote as PersonalQuotePublicSummary;
}

/** Public lookup by opaque customer token — does not consume the quote. */
export async function fetchPersonalQuoteByToken(
  token: string,
): Promise<PersonalQuotePublicSummary> {
  const response = await fetch(
    `${WORKER_BASE}/personal-quotes/by-token?t=${encodeURIComponent(token.trim())}`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(
      String(
        payload.error ||
          "This personal quote link is invalid or no longer available. Please contact My Airport Taxi NI.",
      ),
    );
  }
  const quote = payload.quote;
  if (!quote || typeof quote !== "object") {
    throw new Error(
      "This personal quote link is invalid or no longer available. Please contact My Airport Taxi NI.",
    );
  }
  return quote as PersonalQuotePublicSummary;
}

export async function fetchOwnerPersonalQuotes(
  ownerKey: string,
): Promise<PersonalQuoteOwnerView[]> {
  const response = await fetch(`${WORKER_BASE}/owner/personal-quotes`, {
    headers: {
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    cache: "no-store",
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not load personal quotes"));
  }
  return Array.isArray(payload.quotes) ? (payload.quotes as PersonalQuoteOwnerView[]) : [];
}

export type CreatePersonalQuoteInput = {
  customerName: string;
  customerEmail?: string;
  customerMobile?: string;
  agreedAmount: number;
  standardWebsiteAmount?: number;
  discountAmount?: number;
  pickupLabel?: string;
  dropoffLabel?: string;
  notes?: string;
  singleUse: boolean;
  expiresOn: string;
  expressDropOffSelected?: boolean;
  expressDropOffFee?: number;
  expressDropOffAirport?: "BFS" | "BHD" | null;
  airportCode?: "BFS" | "BHD" | "DUB" | "LDY" | null;
  fromAirport?: boolean;
};

export async function createOwnerPersonalQuote(
  ownerKey: string,
  input: CreatePersonalQuoteInput,
): Promise<PersonalQuoteOwnerView> {
  const response = await fetch(`${WORKER_BASE}/owner/personal-quotes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify(input),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not create personal quote"));
  }
  const quote = payload.quote;
  if (!quote || typeof quote !== "object") {
    throw new Error("Could not create personal quote");
  }
  return quote as PersonalQuoteOwnerView;
}

export async function deactivateOwnerPersonalQuote(
  ownerKey: string,
  code: string,
): Promise<PersonalQuoteOwnerView> {
  const response = await fetch(`${WORKER_BASE}/owner/personal-quotes/deactivate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({ code }),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not deactivate personal quote"));
  }
  const quote = payload.quote;
  if (!quote || typeof quote !== "object") {
    throw new Error("Could not deactivate personal quote");
  }
  return quote as PersonalQuoteOwnerView;
}
