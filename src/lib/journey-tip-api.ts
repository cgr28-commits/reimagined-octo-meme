import { TIP_LINK_INVALID_MESSAGE } from "../../shared/journey-tip";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";

export type TipPageState =
  | { ok: true; state: "paid"; amountGbp: number }
  | { ok: true; state: "open"; paymentNotCompleted?: boolean; paymentUrl?: string }
  | { ok: false; error: string };

async function readTipResponse(response: Response): Promise<TipPageState> {
  const payload = (await response.json().catch(() => null)) as TipPageState | { error?: string } | null;
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
    error: error || "We couldn’t open this tip link just now. Please try again.",
  };
}

export async function fetchTipStatus(token: string): Promise<TipPageState> {
  const response = await fetch(
    `${resolveWorkerBaseUrl()}/tip/status?t=${encodeURIComponent(token)}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );
  return readTipResponse(response);
}

export async function createTipCheckout(token: string, amountGbp: number): Promise<TipPageState> {
  const response = await fetch(`${resolveWorkerBaseUrl()}/tip/checkout`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ token, amountGbp }),
  });
  return readTipResponse(response);
}
