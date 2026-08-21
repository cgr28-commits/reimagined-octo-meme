import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type {
  QuickQuoteDiscountType,
  QuickQuoteJourney,
  QuickQuotePublicSummary,
  QuickQuoteVehicleChoice,
} from "../../shared/quick-quote";

const WORKER_BASE = resolveWorkerBaseUrl();

export type { QuickQuoteJourney, QuickQuotePublicSummary, QuickQuoteVehicleChoice, QuickQuoteDiscountType };

export type QuickQuoteCalculateResult =
  | {
      ok: true;
      amount: number;
      amountLabel: string;
      vehicleType: string;
      vehicleChoice?: QuickQuoteVehicleChoice;
      premiumApplied: boolean;
      returnJourney: boolean;
    }
  | { ok: false; reason?: string; message: string; error?: string };

export type QuickQuoteCreateResult = {
  ok: true;
  quote: QuickQuotePublicSummary & {
    calculatedAmount?: number;
    calculatedAmountLabel?: string;
    discountType?: QuickQuoteDiscountType;
    discountValue?: number;
    discountAmount?: number;
  };
  bookingUrl: string;
  whatsappReply: string;
};

export type QuickQuoteDiscountPayload = {
  discountType?: QuickQuoteDiscountType;
  discountValue?: number;
};

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") return {};
  return payload as Record<string, unknown>;
}

export async function calculateServerQuote(
  journey: QuickQuoteJourney & {
    pickupLat?: number;
    pickupLng?: number;
    dropoffLat?: number;
    dropoffLng?: number;
    vehicleChoice?: QuickQuoteVehicleChoice;
  },
  ownerKey?: string,
): Promise<QuickQuoteCalculateResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (ownerKey?.trim()) {
    headers["X-Owner-Key"] = ownerKey.trim();
  }
  const response = await fetch(`${WORKER_BASE}/quote/calculate`, {
    method: "POST",
    headers,
    body: JSON.stringify(journey),
    cache: "no-store",
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    return {
      ok: false,
      reason: String(payload.reason ?? ""),
      message: String(payload.message || payload.error || "Could not calculate fare"),
      error: String(payload.error ?? ""),
    };
  }
  if (payload.ok !== true) {
    return {
      ok: false,
      message: String(payload.message || "Could not calculate fare"),
    };
  }
  return {
    ok: true,
    amount: Number(payload.amount),
    amountLabel: String(payload.amountLabel ?? ""),
    vehicleType: String(payload.vehicleType ?? ""),
    vehicleChoice:
      payload.vehicleChoice === "Minibus" || payload.vehicleChoice === "Saloon"
        ? payload.vehicleChoice
        : undefined,
    premiumApplied: payload.premiumApplied === true,
    returnJourney: payload.returnJourney === true,
  };
}

export async function createOwnerQuickQuote(
  ownerKey: string,
  journey: QuickQuoteJourney &
    QuickQuoteDiscountPayload & {
      vehicleChoice?: QuickQuoteVehicleChoice;
      pickupLat?: number;
      pickupLng?: number;
      dropoffLat?: number;
      dropoffLng?: number;
    },
): Promise<QuickQuoteCreateResult> {
  const response = await fetch(`${WORKER_BASE}/owner/quick-quotes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify(journey),
    cache: "no-store",
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not create booking link"));
  }
  if (!payload.quote || typeof payload.quote !== "object") {
    throw new Error("Could not create booking link");
  }
  return {
    ok: true,
    quote: payload.quote as QuickQuoteCreateResult["quote"],
    bookingUrl: String(payload.bookingUrl ?? ""),
    whatsappReply: String(payload.whatsappReply ?? ""),
  };
}

export async function fetchQuickQuoteById(id: string): Promise<QuickQuotePublicSummary> {
  const response = await fetch(
    `${WORKER_BASE}/quick-quotes/by-id?id=${encodeURIComponent(id.trim())}`,
    { headers: { Accept: "application/json" }, cache: "no-store" },
  );
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(
      String(
        payload.error ||
          "This quote link is invalid or no longer available. Please contact My Airport Taxi NI.",
      ),
    );
  }
  const quote = payload.quote;
  if (!quote || typeof quote !== "object") {
    throw new Error(
      "This quote link is invalid or no longer available. Please contact My Airport Taxi NI.",
    );
  }
  return quote as QuickQuotePublicSummary;
}
