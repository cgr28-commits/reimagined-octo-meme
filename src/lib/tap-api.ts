import { TIP_LINK_INVALID_MESSAGE } from "../../shared/journey-tip";
import type { TapEventName, TapMetricsSnapshot } from "../../shared/tap-page";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";

export type TapTipPageState =
  | { ok: true; state: "paid"; amountGbp: number; tipToken?: string }
  | {
      ok: true;
      state: "open";
      tipToken?: string;
      paymentNotCompleted?: boolean;
      paymentUrl?: string;
      paymentInProgress?: boolean;
      pendingAmountGbp?: number;
      message?: string;
    }
  | { ok: false; error: string };

async function readTipResponse(response: Response): Promise<TapTipPageState> {
  const payload = (await response.json().catch(() => null)) as
    | (TapTipPageState & { tipToken?: string })
    | { error?: string }
    | null;
  if (
    payload &&
    typeof payload === "object" &&
    "ok" in payload &&
    payload.ok === true &&
    "state" in payload &&
    (payload.state === "paid" || payload.state === "open")
  ) {
    return payload;
  }
  if (response.status === 404) {
    return { ok: false, error: TIP_LINK_INVALID_MESSAGE };
  }
  const error =
    payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "";
  return {
    ok: false,
    error: error || "We couldn’t start that tip just now. Please try again.",
  };
}

export async function fetchTapTipStatus(token: string): Promise<TapTipPageState> {
  const response = await fetch(
    `${resolveWorkerBaseUrl()}/tap/tip/status?t=${encodeURIComponent(token)}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );
  return readTipResponse(response);
}

export async function createTapTipCheckout(
  amountGbp: number,
  token?: string,
): Promise<TapTipPageState> {
  const response = await fetch(`${resolveWorkerBaseUrl()}/tap/tip/checkout`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      amountGbp,
      ...(token ? { token } : {}),
    }),
  });
  return readTipResponse(response);
}

/** Fire-and-forget anonymous event. Never blocks the UI. */
export function trackTapEvent(event: TapEventName): void {
  if (typeof window === "undefined") return;
  void fetch(`${resolveWorkerBaseUrl()}/tap/event`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    cache: "no-store",
    keepalive: true,
    body: JSON.stringify({ event }),
  }).catch(() => {
    // Metrics are best-effort.
  });
}

export async function fetchOwnerTapMetrics(
  ownerKey: string,
): Promise<{ ok: true; metrics: TapMetricsSnapshot }> {
  const response = await fetch(`${resolveWorkerBaseUrl()}/owner/tap-metrics`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; metrics?: TapMetricsSnapshot; error?: string }
    | null;
  if (!response.ok || !payload?.ok || !payload.metrics) {
    throw new Error(payload?.error || "Could not load Tap & Scan metrics");
  }
  return { ok: true, metrics: payload.metrics };
}
