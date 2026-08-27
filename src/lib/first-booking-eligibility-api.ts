/**
 * Client helper: check whether an email has already redeemed the £5 first-booking offer.
 * Used to gate quote UI display — SumUp still re-verifies on the Worker at checkout.
 */

import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import { normalizeFirstBookingEmail } from "../../shared/first-booking-offer";

export type FirstBookingEligibilityResult = {
  ok: boolean;
  enabled: boolean;
  alreadyRedeemed: boolean;
  /** True when the offer can still be applied for this email (enabled and not redeemed). */
  eligible: boolean;
  email: string;
};

export async function checkFirstBookingOfferEligibility(
  email: string,
): Promise<FirstBookingEligibilityResult> {
  const normalised = normalizeFirstBookingEmail(email);
  if (!normalised || !normalised.includes("@")) {
    return {
      ok: false,
      enabled: true,
      alreadyRedeemed: false,
      eligible: false,
      email: normalised,
    };
  }

  const url = new URL(`${resolveWorkerBaseUrl()}/promo/first-booking-eligibility`);
  url.searchParams.set("email", normalised);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`First-booking eligibility check failed (${response.status})`);
  }

  const data = (await response.json()) as {
    ok?: boolean;
    enabled?: boolean;
    alreadyRedeemed?: boolean;
    eligible?: boolean;
    email?: string;
  };

  const enabled = data.enabled !== false;
  const alreadyRedeemed = data.alreadyRedeemed === true;
  const eligible =
    data.eligible === true || (enabled && !alreadyRedeemed && data.ok !== false);

  return {
    ok: data.ok !== false,
    enabled,
    alreadyRedeemed,
    eligible: enabled && !alreadyRedeemed && eligible,
    email: normalizeFirstBookingEmail(data.email ?? normalised),
  };
}
