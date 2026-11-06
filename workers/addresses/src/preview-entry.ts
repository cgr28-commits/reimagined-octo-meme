/**
 * PREVIEW-ONLY Worker entry (used only by wrangler.bespoke-preview.toml).
 * Production uses src/index.ts directly and never loads this file.
 *
 * Wraps the normal Worker with an outbound guard so the isolated preview cannot
 * reach real customers, the real business mailbox, or live payment providers —
 * including through EXISTING code paths that hard-code addresses (e.g. owner
 * alerts to bookings@) or fall back to key-less email providers (FormSubmit).
 *
 *  - Refuses to serve or run jobs unless STRIPE_SECRET_KEY is a TEST key and
 *    PREVIEW_ENVIRONMENT = "bespoke-preview".
 *  - Default-deny outbound HTTP: only an explicit allowlist of hosts.
 *  - api.stripe.com only with a test-mode key.
 *  - api.resend.com only when EVERY recipient (to/cc/bcc) is in
 *    PREVIEW_EMAIL_ALLOWLIST.
 *  - Durable Object stub calls do not use global fetch and are unaffected.
 */

import worker from "./index";
import { corsHeaders } from "../shared/google-places";

export { RefundCoordinator, QuoteLeadCoordinator, MeetGreetCoordinator, ConsentLedger, BespokeQuoteCoordinator } from "./index";

type PreviewEnv = Record<string, unknown> & {
  PREVIEW_ENVIRONMENT?: string;
  STRIPE_SECRET_KEY?: string;
  PREVIEW_EMAIL_ALLOWLIST?: string;
  PREVIEW_EXTRA_ALLOWED_HOSTS?: string;
  /** The ONE website allowed to call this preview Worker (exact https origin, no wildcard). */
  PREVIEW_SITE_ORIGIN?: string;
};

/** Hosts the preview may call. Everything else is blocked. */
export const PREVIEW_ALLOWED_HOSTS = [
  "api.stripe.com", // test-mode key enforced below
  "challenges.cloudflare.com", // Turnstile (test keys)
  "api.resend.com", // recipients filtered below
  "places.googleapis.com", // address search
  "maps.googleapis.com", // address / route lookups
  "oauth2.googleapis.com", // Google token for a TEST calendar, if configured
  "www.googleapis.com", // Google Calendar API (test calendar only)
] as const;

export type BlockedCall = { host: string; reason: string };
export const previewBlockedCalls: BlockedCall[] = [];

let installedFor: string | null = null;
let baseFetch: typeof fetch | null = null;

export function previewMisconfiguration(env: PreviewEnv): string | null {
  if (env.PREVIEW_ENVIRONMENT !== "bespoke-preview") return "PREVIEW_ENVIRONMENT must be \"bespoke-preview\"";
  const key = String(env.STRIPE_SECRET_KEY ?? "").trim();
  if (key && !/^(sk|rk)_test_/.test(key)) return "STRIPE_SECRET_KEY must be a Stripe TEST key on preview";
  if (!String(env.PREVIEW_EMAIL_ALLOWLIST ?? "").trim()) return "PREVIEW_EMAIL_ALLOWLIST must list the tester inboxes";
  if (!isExactHttpsOrigin(env.PREVIEW_SITE_ORIGIN)) return "PREVIEW_SITE_ORIGIN must be one exact https origin (no wildcard, no path)";
  return null;
}

/** "https://host" only — no wildcard, path, query, port or trailing slash. */
export function isExactHttpsOrigin(value: unknown): value is string {
  if (typeof value !== "string" || value.includes("*")) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.port && url.origin === value && /^[a-z0-9.-]+$/.test(url.hostname);
  } catch {
    return false;
  }
}

/**
 * CORS on preview: ONLY PREVIEW_SITE_ORIGIN may read responses. The production
 * allow-list (shared/google-places.ts) is left unchanged; this wrapper overrides
 * it for the preview Worker alone, so neither the live website nor any other
 * site can call the preview API from a browser.
 */
function previewCors(response: Response, requestOrigin: string | null, siteOrigin: string): Response {
  const out = new Response(response.body, response);
  if (requestOrigin === siteOrigin) {
    out.headers.set("Access-Control-Allow-Origin", siteOrigin);
    out.headers.set("Access-Control-Allow-Credentials", "true");
    out.headers.set("Vary", "Origin");
  } else {
    out.headers.delete("Access-Control-Allow-Origin");
    out.headers.delete("Access-Control-Allow-Credentials");
  }
  return out;
}

function emailsIn(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return list
    .map((v) => String(v))
    .map((v) => (/<([^>]+)>/.exec(v)?.[1] ?? v).trim().toLowerCase())
    .filter(Boolean);
}

export function installPreviewOutboundGuard(env: PreviewEnv): void {
  const signature = `${env.PREVIEW_EMAIL_ALLOWLIST ?? ""}|${env.PREVIEW_EXTRA_ALLOWED_HOSTS ?? ""}`;
  if (installedFor === signature) return;
  baseFetch = baseFetch ?? globalThis.fetch.bind(globalThis);
  const allowedHosts = new Set<string>([
    ...PREVIEW_ALLOWED_HOSTS,
    ...String(env.PREVIEW_EXTRA_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  ]);
  const testers = new Set(
    String(env.PREVIEW_EMAIL_ALLOWLIST ?? "")
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean),
  );
  const block = (host: string, reason: string): Response => {
    previewBlockedCalls.push({ host, reason });
    console.warn("[preview] blocked outbound call", host, reason);
    return new Response(JSON.stringify({ error: `blocked on preview: ${reason}` }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  };
  const original = baseFetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input as RequestInfo, init);
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    if (!allowedHosts.has(host)) return block(host, "host not on the preview allowlist");
    if (host === "api.stripe.com") {
      const auth = request.headers.get("Authorization") ?? "";
      if (!/^Bearer (sk|rk)_test_/.test(auth)) return block(host, "Stripe call without a TEST key");
    }
    if (host === "api.resend.com" && request.method === "POST") {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(await request.clone().text()) as Record<string, unknown>;
      } catch {
        return block(host, "unreadable email payload");
      }
      const recipients = [...emailsIn(payload.to), ...emailsIn(payload.cc), ...emailsIn(payload.bcc)];
      if (recipients.length === 0 || recipients.some((r) => !testers.has(r))) {
        return block(host, `recipient not in PREVIEW_EMAIL_ALLOWLIST (${recipients.join(", ") || "none"})`);
      }
    }
    return original(request);
  }) as typeof fetch;
  installedFor = signature;
}

function refuse(reason: string): Response {
  return new Response(JSON.stringify({ error: `Preview misconfigured: ${reason}` }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: PreviewEnv, ctx?: ExecutionContext): Promise<Response> {
    const problem = previewMisconfiguration(env);
    if (problem) return refuse(problem);
    installPreviewOutboundGuard(env);
    const siteOrigin = env.PREVIEW_SITE_ORIGIN as string;
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") {
      if (origin !== siteOrigin) return new Response(null, { status: 403 });
      const base = corsHeaders(siteOrigin) as Record<string, string>;
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": siteOrigin,
          "Access-Control-Allow-Methods": base["Access-Control-Allow-Methods"] ?? "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": base["Access-Control-Allow-Headers"] ?? "Content-Type",
          "Access-Control-Allow-Credentials": "true",
          Vary: "Origin",
        },
      });
    }
    return previewCors(await worker.fetch(request, env as never, ctx), origin, siteOrigin);
  },
  async scheduled(event: ScheduledEvent, env: PreviewEnv, ctx: ExecutionContext): Promise<void> {
    const problem = previewMisconfiguration(env);
    if (problem) {
      console.error("[preview] scheduled jobs skipped:", problem);
      return;
    }
    installPreviewOutboundGuard(env);
    return worker.scheduled(event, env as never, ctx);
  },
};
