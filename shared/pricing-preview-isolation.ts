/**
 * Preview deployments (Vercel/Pages/localhost) must never write live pricing KV.
 * Host detection is the only signal — do not trust a client-supplied flag alone.
 */

export const PREVIEW_PRICING_FORBIDDEN_CODE = "preview_isolated";
export const PREVIEW_PRICING_FORBIDDEN_MESSAGE =
  "Preview cannot change live customer pricing.";

export const PREVIEW_PRICING_BANNER =
  "PREVIEW MODE — Changes made here do not affect live customer pricing.";

export function hostnameIsPricingPreview(hostname: string | null | undefined): boolean {
  const host = String(hostname ?? "")
    .toLowerCase()
    .split(":")[0]
    .trim();
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return true;
  if (host.endsWith(".vercel.app")) return true;
  if (host.endsWith(".pages.dev")) return true;
  return false;
}

export function originIsPricingPreview(originOrUrl: string | null | undefined): boolean {
  const raw = String(originOrUrl ?? "").trim();
  if (!raw) return false;
  try {
    return hostnameIsPricingPreview(new URL(raw).hostname);
  } catch {
    return hostnameIsPricingPreview(raw);
  }
}

export function requestIsPricingPreview(request: {
  headers: { get(name: string): string | null };
}): boolean {
  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");
  return originIsPricingPreview(origin) || originIsPricingPreview(referer);
}
