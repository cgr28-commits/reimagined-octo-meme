/** Staging-only transport boundary. The production entrypoint never imports this module. */
export const STAGING_NAME = "reimagined-octo-meme-pr692-staging";
export const RELEASE_SHA = "df16c3530c9cdf575237e1ab87303b06807b0f4b";
type ReleaseEnv = Parameters<(typeof import("./index"))["default"]["fetch"]>[1];
export type StagingEnv = ReleaseEnv & {STAGING_ENVIRONMENT?: string; STAGING_RELEASE_SHA?: string; PUBLIC_SITE_ORIGIN?: string; CONSENT_LEDGER?: DurableObjectNamespace};
export function isolatedEnv(env: StagingEnv) {
  if (env.STAGING_ENVIRONMENT !== STAGING_NAME || env.STAGING_RELEASE_SHA !== RELEASE_SHA) throw new Error("Invalid staging identity");
  const origin = new URL(env.PUBLIC_SITE_ORIGIN ?? "https://invalid.invalid");
  if (origin.protocol !== "https:" || !/^matni-pr692-staging(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin.hostname) || origin.origin !== env.PUBLIC_SITE_ORIGIN) throw new Error("Invalid staging frontend origin");
  if (!env.TRACKING_STORE || !env.BOOKING_COUNTER || !env.OWNER_ACCESS_KEY || !env.QUOTE_RECEIPT_SECRET || !env.GOOGLE_PLACES_API_KEY) throw new Error("Staging bindings incomplete");
  // Explicit allowlist: no calendar, Ads, email-provider, webhook or production service bindings.
  return {
    TRACKING_STORE:env.TRACKING_STORE, BOOKING_COUNTER:env.BOOKING_COUNTER,
    REFUND_COORDINATOR:env.REFUND_COORDINATOR, QUOTE_LEAD_COORDINATOR:env.QUOTE_LEAD_COORDINATOR,
    MEET_GREET_COORDINATOR:env.MEET_GREET_COORDINATOR, CONSENT_LEDGER:env.CONSENT_LEDGER,
    GOOGLE_PLACES_API_KEY:env.GOOGLE_PLACES_API_KEY,
    SUMUP_API_KEY:env.SUMUP_API_KEY, SUMUP_MERCHANT_CODE:env.SUMUP_MERCHANT_CODE,
    OWNER_ACCESS_KEY:env.OWNER_ACCESS_KEY, DRIVER_ACCESS_KEY:env.OWNER_ACCESS_KEY,
    QUOTE_RECEIPT_SECRET:env.QUOTE_RECEIPT_SECRET, PUBLIC_SITE_ORIGIN:origin.origin,
    BOOKING_TO_EMAIL:"owner@example.invalid", BOOKING_NOTIFICATION_EMAIL:"owner@example.invalid",
    OWNER_EMAIL_COPY_ADDRESS:"owner@example.invalid", BOOKING_FROM_EMAIL:"staging@example.invalid",
    STAGING_EMAIL_CAPTURE_STORE:env.TRACKING_STORE,
  };
}
export async function verifySandbox(env: Pick<StagingEnv,"SUMUP_API_KEY"|"SUMUP_MERCHANT_CODE">): Promise<void> {
  if (!env.SUMUP_API_KEY?.trim() || !env.SUMUP_MERCHANT_CODE?.trim()) throw new Error("Sandbox credentials missing");
  const merchant = env.SUMUP_MERCHANT_CODE.trim();
  const response = await fetch(`https://api.sumup.com/v1/merchants/${encodeURIComponent(merchant)}`, {
    headers:{Authorization:`Bearer ${env.SUMUP_API_KEY.trim()}`}, redirect:"error", signal:AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Sandbox verification unavailable");
  const profile = await response.json() as {sandbox?: boolean; merchant_code?: string};
  if (profile.sandbox !== true || profile.merchant_code !== merchant) throw new Error("Refusing non-sandbox merchant");
}
