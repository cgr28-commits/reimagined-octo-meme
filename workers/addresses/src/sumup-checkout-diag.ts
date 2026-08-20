/**
 * Owner-only SumUp checkout diagnostics (no card data / secrets).
 */

import {
  getSumUpCheckout,
  summarizeSumUpCheckoutForLog,
} from "../shared/sumup-checkout";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import { getPendingCheckout, pendingCheckoutStoreConfigured } from "./pending-checkout-store";

export type SumUpCheckoutDiagEnv = DriverAuthEnv & {
  TRACKING_STORE?: KVNamespace;
  SUMUP_API_KEY?: string;
  SUMUP_MERCHANT_CODE?: string;
};

export function isOwnerSumUpCheckoutPath(pathname: string): boolean {
  return (
    pathname === "/owner/sumup-checkout" || pathname === "/api/owner/sumup-checkout"
  );
}

export async function handleOwnerSumUpCheckoutLookup(
  request: Request,
  env: SumUpCheckoutDiagEnv,
): Promise<
  | {
      ok: true;
      checkoutId: string;
      sumUp: Record<string, unknown>;
      pending?: {
        amount: number;
        checkoutReference: string;
        personalQuoteCode?: string;
        personalQuotedAmount?: number;
        standardWebsiteAmount?: number;
        createdAt: string;
        finalizedAt?: string;
        unsuccessfulEmailSentAt?: string;
      } | null;
    }
  | { error: string; status: number }
> {
  if (!ownerAuthorized(request, env)) {
    return { error: "Unauthorized — owner access required.", status: 401 };
  }

  const apiKey = env.SUMUP_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return { error: "SumUp is not configured on this Worker.", status: 503 };
  }

  const url = new URL(request.url);
  const checkoutId = (url.searchParams.get("id") ?? url.searchParams.get("checkoutId") ?? "").trim();
  if (!checkoutId) {
    return { error: "Missing checkout id (?id=…)", status: 400 };
  }

  try {
    const checkout = await getSumUpCheckout(apiKey, checkoutId);
    const pending =
      pendingCheckoutStoreConfigured(env.TRACKING_STORE) && env.TRACKING_STORE
        ? await getPendingCheckout(env.TRACKING_STORE, checkoutId)
        : null;

    return {
      ok: true,
      checkoutId,
      sumUp: {
        ...summarizeSumUpCheckoutForLog(checkout),
        description: checkout.description ?? null,
      },
      pending: pending
        ? {
            amount: pending.amount,
            checkoutReference: pending.checkoutReference,
            ...(pending.personalQuoteCode
              ? { personalQuoteCode: pending.personalQuoteCode }
              : {}),
            ...(typeof pending.personalQuotedAmount === "number"
              ? { personalQuotedAmount: pending.personalQuotedAmount }
              : {}),
            ...(typeof pending.standardWebsiteAmount === "number"
              ? { standardWebsiteAmount: pending.standardWebsiteAmount }
              : {}),
            createdAt: pending.createdAt,
            ...(pending.finalizedAt ? { finalizedAt: pending.finalizedAt } : {}),
            ...(pending.unsuccessfulEmailSentAt
              ? { unsuccessfulEmailSentAt: pending.unsuccessfulEmailSentAt }
              : {}),
          }
        : null,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not look up SumUp checkout",
      status: 502,
    };
  }
}
