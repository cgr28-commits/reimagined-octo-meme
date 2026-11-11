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

export function makeSandboxFetch(): typeof fetch {
  const sandboxFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
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
  (globalThis as { fetch: typeof fetch }).fetch = makeSandboxFetch();
}
