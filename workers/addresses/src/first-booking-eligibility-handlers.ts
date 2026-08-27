/**
 * Public eligibility check for the £5 first-booking offer (by email redemption).
 * Does not change pricing — QuoteCard uses this to decide whether to *display* the discount.
 */

import { corsHeaders } from "../shared/google-places";
import {
  FIRST_BOOKING_OFFER_CONFIG,
  normalizeFirstBookingEmail,
} from "../shared/first-booking-offer";
import { hasRedeemedFirstBookingOffer } from "./first-booking-offer-store";

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

type EligibilityEnv = {
  TRACKING_STORE?: KVNamespace;
};

export function isFirstBookingEligibilityPath(pathname: string): boolean {
  return (
    pathname === "/promo/first-booking-eligibility" ||
    pathname === "/api/promo/first-booking-eligibility"
  );
}

export async function handleFirstBookingEligibilityRequest(
  request: Request,
  env: EligibilityEnv,
  origin: string | null,
): Promise<Response> {
  const url = new URL(request.url);
  let email = "";

  if (request.method === "GET") {
    email = String(url.searchParams.get("email") ?? "").trim();
  } else if (request.method === "POST") {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      email = String(body.email ?? "").trim();
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400, origin);
    }
  } else {
    return json({ ok: false, error: "Method not allowed" }, 405, origin);
  }

  const normalised = normalizeFirstBookingEmail(email);
  if (!normalised || !normalised.includes("@")) {
    return json({ ok: false, error: "Valid email required" }, 400, origin);
  }

  const enabled = FIRST_BOOKING_OFFER_CONFIG.enabled;
  const alreadyRedeemed = enabled
    ? await hasRedeemedFirstBookingOffer(env.TRACKING_STORE, normalised)
    : false;

  return json(
    {
      ok: true,
      enabled,
      alreadyRedeemed,
      eligible: enabled && !alreadyRedeemed,
      email: normalised,
      discountAmountGbp: FIRST_BOOKING_OFFER_CONFIG.discountAmountGbp,
      minimumEligibleJourneyFareGbp:
        FIRST_BOOKING_OFFER_CONFIG.minimumEligibleJourneyFareGbp,
    },
    200,
    origin,
  );
}
