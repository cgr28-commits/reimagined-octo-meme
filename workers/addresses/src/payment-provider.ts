/**
 * Which card provider takes a payment, and one call to create the checkout.
 *
 * - PAYMENT_PROVIDER=stripe-test → Stripe only for STRIPE_TEST_EMAILS customers.
 * - PAYMENT_PROVIDER=stripe      → Stripe for everyone (LIVE key required, so a
 *   test key can never take real customers' money).
 * - anything else                → SumUp.
 *
 * The Stripe result has the same shape as a SumUp hosted checkout: paymentUrl is
 * our own /pay/card/ page, checkoutId a Checkout Session id (cs_…). Everything
 * downstream (getSumUpCheckout, refunds) already routes Stripe ids to Stripe.
 */
import {
  createSumUpHostedCheckout,
  type SumUpCheckoutRequest,
  type SumUpCheckoutResult,
} from "../shared/sumup-checkout";
import {
  createStripeCheckoutSession,
  getStripeCheckoutAsSumUp,
  isStripeCheckoutId,
  stripeModeFromKey,
  cleanSecretValue,
} from "../shared/stripe-payments";
import { BUSINESS_WEBSITE } from "../shared/business-email";

export type PaymentProviderEnv = {
  PAYMENT_PROVIDER?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_TEST_EMAILS?: string;
  SUMUP_API_KEY?: string;
  SUMUP_MERCHANT_CODE?: string;
};

/**
 * `customerEmail === undefined` asks "could Stripe be used at all" (early gates
 * before the booking is known).
 */
export function stripeActiveFor(env: PaymentProviderEnv, customerEmail?: string | null): boolean {
  const key = cleanSecretValue(env.STRIPE_SECRET_KEY);
  if (!key) return false;
  const provider = cleanSecretValue(env.PAYMENT_PROVIDER).toLowerCase().replace(/[\s_]+/g, "-");
  // Live switch: anything except a test key goes to Stripe (a bad key then fails loudly
  // at Stripe instead of quietly sending customers to SumUp).
  if (provider === "stripe" || provider === "stripe-live" || provider === "live") {
    return stripeModeFromKey(key) !== "test";
  }
  if (provider === "stripe-test") {
    if (customerEmail === undefined) return true;
    const email = customerEmail?.trim().toLowerCase() ?? "";
    const allowed = (env.STRIPE_TEST_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    return Boolean(email) && allowed.includes(email);
  }
  return false;
}

/** True when some provider can take a card payment (for "payment unavailable" gates). */
export function cardPaymentsConfigured(env: PaymentProviderEnv, customerEmail?: string | null): boolean {
  if (stripeActiveFor(env, customerEmail)) return true;
  return Boolean(env.SUMUP_API_KEY?.trim() && env.SUMUP_MERCHANT_CODE?.trim());
}

/**
 * Create the hosted checkout with Stripe (when active for this customer) or SumUp.
 * `redirectUrl` is where the customer lands afterwards (Stripe appends
 * checkout_id). `siteOrigin` is where our /pay/card/ page lives.
 */
export async function createHostedCheckout(
  env: PaymentProviderEnv,
  request: SumUpCheckoutRequest,
  options: { customerEmail?: string | null; siteOrigin?: string } = {},
): Promise<SumUpCheckoutResult> {
  if (stripeActiveFor(env, options.customerEmail ?? null)) {
    const session = await createStripeCheckoutSession({
      amount: request.amount,
      description: request.description,
      checkoutReference: request.checkoutReference,
      returnUrl: request.redirectUrl,
      ...(request.metadata ? { metadata: request.metadata } : {}),
      customerEmail: options.customerEmail ?? undefined,
      siteOrigin: options.siteOrigin || BUSINESS_WEBSITE,
    });
    return {
      checkoutId: session.checkoutId,
      paymentUrl: session.paymentUrl,
      checkoutReference: session.checkoutReference,
      createdAt: session.createdAt,
    };
  }
  return createSumUpHostedCheckout(
    env.SUMUP_API_KEY?.trim() ?? "",
    env.SUMUP_MERCHANT_CODE?.trim() ?? "",
    request,
  );
}

/**
 * Can an existing unpaid checkout still be reused? Stripe sessions expire after
 * 23 hours; SumUp checkouts keep the previous behaviour (reuse).
 */
export async function hostedCheckoutStillOpen(checkoutId: string): Promise<boolean> {
  if (!isStripeCheckoutId(checkoutId)) return true;
  try {
    const checkout = await getStripeCheckoutAsSumUp(checkoutId);
    return checkout.status === "PENDING";
  } catch {
    return false;
  }
}

/**
 * Key to pass to the SumUp helpers for this id. Stripe ids (cs_/pi_) are routed
 * to Stripe inside those helpers, so they work even once SumUp keys are removed.
 */
export function providerKeyFor(
  env: PaymentProviderEnv,
  id: string | null | undefined,
): string {
  const sumup = env.SUMUP_API_KEY?.trim() ?? "";
  if (sumup) return sumup;
  const trimmed = String(id ?? "").trim();
  const stripeId = isStripeCheckoutId(trimmed) || /^pi_[A-Za-z0-9]+/.test(trimmed);
  return stripeId && env.STRIPE_SECRET_KEY?.trim() ? "stripe" : "";
}

/** Non-secret summary of the payment switch, for checking the live setup. */
export function paymentProviderStatus(env: PaymentProviderEnv & { STRIPE_PUBLISHABLE_KEY?: string; STRIPE_WEBHOOK_SECRET?: string }) {
  const key = cleanSecretValue(env.STRIPE_SECRET_KEY);
  const pk = cleanSecretValue(env.STRIPE_PUBLISHABLE_KEY);
  return {
    paymentProvider: cleanSecretValue(env.PAYMENT_PROVIDER).toLowerCase() || "(not set)",
    secretKey: key ? `${key.slice(0, 8)}… (${stripeModeFromKey(key)})` : "(not set)",
    publishableKey: pk ? `${pk.slice(0, 8)}… (${pk.includes("_live_") ? "live" : pk.includes("_test_") ? "test" : "unknown"})` : "(not set)",
    webhookSecret: cleanSecretValue(env.STRIPE_WEBHOOK_SECRET).startsWith("whsec_") ? "set" : "missing or wrong",
    everyoneUsesStripe: stripeActiveFor(env, "") ,
  };
}
