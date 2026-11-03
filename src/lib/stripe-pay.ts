/** Helpers for the on-site Stripe payment page (/pay/card/). */

const DEFAULT_WORKER_BASE = "https://reimagined-octo-meme.cgr28.workers.dev";

export const STRIPE_PAY_PATH = "/pay/card/";

/** True when a payment URL is our own Stripe page (open in the same tab). */
export function isOnSitePaymentUrl(paymentUrl: string): boolean {
  try {
    const url = new URL(paymentUrl, "https://www.myairporttaxini.co.uk");
    return url.pathname === STRIPE_PAY_PATH || url.pathname === STRIPE_PAY_PATH.slice(0, -1);
  } catch {
    return false;
  }
}

export function stripeWorkerBaseUrl(): string {
  const bookings = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";
  if (!bookings) return DEFAULT_WORKER_BASE;
  try {
    const host = new URL(bookings).hostname.toLowerCase();
    if (host === "www.myairporttaxini.co.uk" || host === "myairporttaxini.co.uk") {
      return DEFAULT_WORKER_BASE;
    }
    return bookings.replace(/\/bookings\/?$/, "");
  } catch {
    return DEFAULT_WORKER_BASE;
  }
}

export type StripeSessionInfo = {
  status: "open" | "complete" | "expired";
  clientSecret?: string;
  publishableKey?: string;
  amount: number | null;
  currency: string;
  reference: string;
  cardHold: boolean;
  /** "short_notice": held while the owner confirms availability. */
  holdKind?: "short_notice" | null;
  code?: string;
  error?: string;
};

export async function fetchStripeSession(checkoutId: string): Promise<StripeSessionInfo> {
  const response = await fetch(
    `${stripeWorkerBaseUrl()}/payments/stripe-session?checkout=${encodeURIComponent(checkoutId)}`,
    { cache: "no-store" },
  );
  const body = (await response.json().catch(() => null)) as StripeSessionInfo | null;
  if (!body) throw new Error("We couldn't open this payment link");
  if (!response.ok && response.status !== 410) {
    throw new Error(body.error || "We couldn't open this payment link");
  }
  return body;
}

/** Load Stripe.js from js.stripe.com (required for PCI compliance — never bundle it). */
export function loadStripeJs(): Promise<StripeGlobal> {
  const w = window as unknown as { Stripe?: StripeGlobal };
  if (w.Stripe) return Promise.resolve(w.Stripe);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-stripe-js="1"]');
    const script = existing ?? document.createElement("script");
    const done = () => (w.Stripe ? resolve(w.Stripe) : reject(new Error("Stripe failed to load")));
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => reject(new Error("Stripe failed to load")), { once: true });
    if (!existing) {
      // Versioned Stripe.js (Elements with Checkout Sessions needs a current release).
      script.src = "https://js.stripe.com/endive/stripe.js";
      script.async = true;
      script.dataset.stripeJs = "1";
      document.head.appendChild(script);
    }
  });
}

// Minimal typings for the parts of Stripe.js we use.
type StripeElement = {
  mount(selector: string | HTMLElement): void;
  on(event: string, handler: (event: Record<string, unknown>) => void): void;
  destroy?: () => void;
};
type StripeActions = { confirm(): Promise<{ type: string; error?: { message?: string } }> };
export type StripeCheckout = {
  createPaymentElement(options?: Record<string, unknown>): StripeElement;
  createExpressCheckoutElement(options?: Record<string, unknown>): StripeElement;
  loadActions(): Promise<{ type: string; actions: StripeActions; error?: { message?: string } }>;
};
export type StripeInstance = {
  initCheckoutElementsSdk(options: { clientSecret: string | Promise<string>; elementsOptions?: Record<string, unknown> }): StripeCheckout;
};
export type StripeGlobal = (publishableKey: string) => StripeInstance;
