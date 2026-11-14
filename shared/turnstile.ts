/**
 * Cloudflare Turnstile server-side verification (free).
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * The browser widget only produces a token; this check is what actually
 * protects the endpoint. Always fail closed.
 */

export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const DEFAULT_TURNSTILE_HOSTNAMES = ["www.myairporttaxini.co.uk", "myairporttaxini.co.uk"] as const;

export type TurnstileVerifyResult = { ok: true } | { ok: false; reason: string };

type SiteverifyResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
  metadata?: { result_with_testing_key?: boolean };
};

export function parseTurnstileHostnames(value: string | undefined | null): string[] {
  const list = String(value ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 ? list : [...DEFAULT_TURNSTILE_HOSTNAMES];
}

export async function verifyTurnstileToken(input: {
  secret: string | undefined;
  token: unknown;
  remoteIp?: string | null;
  expectedAction: string;
  allowedHostnames: readonly string[];
  fetchImpl?: typeof fetch;
  /**
   * PREVIEW ONLY. Cloudflare's published always-pass test secret answers with
   * hostname "example.com", no action and metadata.result_with_testing_key = true.
   * When this is set, such an answer is accepted. A real secret never produces
   * that marker, so this cannot weaken a production widget.
   */
  allowTestingKey?: boolean;
}): Promise<TurnstileVerifyResult> {
  const secret = input.secret?.trim();
  if (!secret) return { ok: false, reason: "not_configured" };
  if (typeof input.token !== "string" || !input.token || input.token.length > 2048) {
    return { ok: false, reason: "missing_token" };
  }
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", input.token);
  if (input.remoteIp) body.append("remoteip", input.remoteIp);
  body.append("idempotency_key", crypto.randomUUID());

  let data: SiteverifyResponse;
  try {
    const response = await (input.fetchImpl ?? fetch)(TURNSTILE_SITEVERIFY_URL, { method: "POST", body });
    if (!response.ok) return { ok: false, reason: `siteverify_http_${response.status}` };
    data = (await response.json()) as SiteverifyResponse;
  } catch {
    return { ok: false, reason: "siteverify_unreachable" };
  }
  if (data.success !== true) return { ok: false, reason: (data["error-codes"] ?? ["failed"]).join(",") };
  if (data.metadata?.result_with_testing_key === true) {
    return input.allowTestingKey === true ? { ok: true } : { ok: false, reason: "testing_key_not_allowed" };
  }
  if (data.action !== input.expectedAction) return { ok: false, reason: "action_mismatch" };
  const host = String(data.hostname ?? "").toLowerCase();
  if (!input.allowedHostnames.includes(host)) return { ok: false, reason: "hostname_mismatch" };
  return { ok: true };
}
