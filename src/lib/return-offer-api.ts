import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type { ReturnOfferPublicSnapshot } from "../../shared/return-offer";

const WORKER_BASE = resolveWorkerBaseUrl();

export type ReturnOfferLookupResult =
  | { ok: true; quote: ReturnOfferPublicSnapshot }
  | { ok: false; error: string; reason?: string };

export async function fetchReturnOfferByToken(
  token: string,
): Promise<ReturnOfferLookupResult> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, error: "This return offer link is invalid." };
  }
  const url = new URL("/return-offers/by-token", `${WORKER_BASE}/`);
  url.searchParams.set("t", trimmed);
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; quote?: ReturnOfferPublicSnapshot; error?: string; reason?: string }
    | null;
  if (!response.ok || !payload?.ok || !payload.quote) {
    return {
      ok: false,
      error:
        typeof payload?.error === "string"
          ? payload.error
          : "This return offer link is invalid or no longer available.",
      reason: payload?.reason,
    };
  }
  return { ok: true, quote: payload.quote };
}
