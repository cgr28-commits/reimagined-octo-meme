/**
 * Dashboard staging sandbox.
 *
 * Only the isolated staging build (wrangler.dashboard-staging.toml) defines
 * __MATNI_STAGING_SANDBOX__ = true. Production and the existing preview build
 * never define it, so this module does nothing there.
 *
 * When it is defined, every outbound HTTP request from this Worker (including
 * its Durable Objects, which load the same module) is refused before it leaves
 * Cloudflare. That stops real emails (Resend, Web3Forms, MailChannels,
 * FormSubmit), WhatsApp messages, Stripe calls, Google Ads uploads and any other
 * third-party side effect, even if a secret is added by mistake.
 *
 * Two narrow exceptions let the staging build be genuinely tested end to end:
 *  1. Stripe TEST mode: https://api.stripe.com/v1/... only when the request itself carries a
 *     Stripe TEST secret (sk_test_ / rk_test_). A live key is refused, so a mistake cannot
 *     reach real money. Stripe test mode never charges a card.
 *  2. Google address look-ups (Places + Geocoding). These are read-only and have no side effects.
 * Everything else (email, WhatsApp, calendar, Google Ads, SumUp…) stays blocked.
 *
 * Internal Durable Object stub calls do not use globalThis.fetch and still work.
 * This module must be the first import in src/index.ts.
 */

declare const __MATNI_STAGING_SANDBOX__: boolean | undefined;

export const STAGING_SANDBOX: boolean =
  typeof __MATNI_STAGING_SANDBOX__ !== "undefined" && __MATNI_STAGING_SANDBOX__ === true;

export type BlockedOutboundRecord = { url: string; method: string; at: string };

const blockedLog: BlockedOutboundRecord[] = [];

/** Recent blocked requests (in-memory, this isolate only) — for staging checks. */
export function recentBlockedOutbound(): BlockedOutboundRecord[] {
  return blockedLog.slice(-50);
}

export type SandboxDecision = "allow_stripe_test" | "allow_google_lookup" | "block";

const STRIPE_TEST_KEY = /^Bearer (sk|rk)_test_[A-Za-z0-9_]{8,}$/;
const GOOGLE_LOOKUP_PATHS: Array<[string, RegExp]> = [
  ["places.googleapis.com", /^\/v1\/places(:autocomplete|:searchText|\/[A-Za-z0-9_-]+)$/],
  ["maps.googleapis.com", /^\/maps\/api\/geocode\/json$/],
];

/** Pure decision used by the sandbox fetch (exported so it can be tested without a network). */
export function sandboxDecision(rawUrl: string, method: string, headers: Headers): SandboxDecision {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "block";
  }
  if (parsed.protocol !== "https:" || parsed.port) return "block";
  const verb = method.toUpperCase();
  if (parsed.hostname === "api.stripe.com") {
    return parsed.pathname.startsWith("/v1/") && STRIPE_TEST_KEY.test((headers.get("authorization") ?? "").trim())
      ? "allow_stripe_test"
      : "block";
  }
  if (verb === "GET" || verb === "POST") {
    for (const [host, path] of GOOGLE_LOOKUP_PATHS) {
      if (parsed.hostname === host && path.test(parsed.pathname)) return "allow_google_lookup";
    }
  }
  return "block";
}

export function makeSandboxFetch(realFetch?: typeof fetch): typeof fetch {
  const sandboxFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (realFetch) {
      try {
        const asRequest = input instanceof Request ? input : null;
        const rawUrl = asRequest ? asRequest.url : String(input);
        const verb = init?.method || asRequest?.method || "GET";
        const headers = new Headers(init?.headers ?? asRequest?.headers ?? undefined);
        if (sandboxDecision(rawUrl, verb, headers) !== "block") return realFetch(input as RequestInfo, init);
      } catch {
        /* fall through to the block */
      }
    }
    let url = "";
    let method = init?.method || "GET";
    try {
      if (typeof input === "string") url = input;
      else if (input instanceof URL) url = input.toString();
      else {
        url = (input as Request).url;
        method = init?.method || (input as Request).method || "GET";
      }
    } catch {
      url = "(unreadable)";
    }
    // Never log query strings: they can hold keys or personal data.
    let safeUrl = url;
    try {
      const parsed = new URL(url);
      safeUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      /* keep as-is */
    }
    const record = { url: safeUrl, method: method.toUpperCase(), at: new Date().toISOString() };
    blockedLog.push(record);
    if (blockedLog.length > 200) blockedLog.splice(0, blockedLog.length - 200);
    console.warn(JSON.stringify({ event: "staging_outbound_blocked", ...record }));
    return new Response(
      JSON.stringify({ ok: false, error: "Outbound requests are disabled on the dashboard staging Worker." }),
      { status: 503, headers: { "content-type": "application/json", "x-matni-staging-sandbox": "blocked" } },
    );
  };
  return sandboxFetch as typeof fetch;
}

if (STAGING_SANDBOX) {
  const original = globalThis.fetch.bind(globalThis);
  (globalThis as { fetch: typeof fetch }).fetch = makeSandboxFetch(original);
}
