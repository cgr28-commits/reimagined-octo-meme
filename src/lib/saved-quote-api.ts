import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type {
  SavedQuoteJourneySnapshot,
  SavedQuotePricingSnapshot,
  SavedQuotePublicSummary,
} from "../../shared/saved-quote";

const WORKER_BASE = resolveWorkerBaseUrl();

export type { SavedQuotePublicSummary, SavedQuoteJourneySnapshot, SavedQuotePricingSnapshot };

export type SaveQuoteRequest = {
  customerName: string;
  customerEmail: string;
  journey: SavedQuoteJourneySnapshot;
  pricing: SavedQuotePricingSnapshot;
};

export type SaveQuoteResult = {
  ok: true;
  token: string;
  reference: string;
  expiresAt: string;
  expiresAtLabel: string;
  amount: number;
  amountLabel: string;
  currency: "GBP";
  email: string;
  emailSent: boolean;
  emailError?: string;
  quoteUrl: string;
  quote: SavedQuotePublicSummary;
};

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return {};
  }
  return payload as Record<string, unknown>;
}

/** Create a saved quote + send initial email (name + email only). */
export async function saveQuote(input: SaveQuoteRequest): Promise<SaveQuoteResult> {
  const response = await fetch(`${WORKER_BASE}/saved-quotes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not save your quote. Please try again."));
  }
  if (!payload.token || !payload.reference) {
    throw new Error("Could not save your quote. Please try again.");
  }
  return payload as unknown as SaveQuoteResult;
}

export type FetchSavedQuoteResult =
  | { ok: true; quote: SavedQuotePublicSummary; canBook: true }
  | {
      ok: false;
      error: "booked" | "expired" | "not_found" | string;
      quote?: SavedQuotePublicSummary;
      canBook: false;
      message?: string;
    };

/** Public lookup by opaque token — does not consume the quote. */
export async function fetchSavedQuoteByToken(token: string): Promise<FetchSavedQuoteResult> {
  const response = await fetch(
    `${WORKER_BASE}/saved-quotes/by-token?t=${encodeURIComponent(token.trim())}`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );
  const payload = await parseJson(response);
  if (response.status === 404) {
    return {
      ok: false,
      error: "not_found",
      canBook: false,
      message: String(payload.message || payload.error || "Quote not found."),
    };
  }
  if (!response.ok) {
    const err = String(payload.error || "not_found");
    return {
      ok: false,
      error: err,
      canBook: false,
      quote:
        payload.quote && typeof payload.quote === "object"
          ? (payload.quote as SavedQuotePublicSummary)
          : undefined,
      message: String(payload.message || payload.error || "Quote not available."),
    };
  }
  const quote = payload.quote;
  if (!quote || typeof quote !== "object") {
    return { ok: false, error: "not_found", canBook: false, message: "Quote not found." };
  }
  return {
    ok: true,
    quote: quote as SavedQuotePublicSummary,
    canBook: true,
  };
}
