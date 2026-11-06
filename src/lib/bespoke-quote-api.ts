/**
 * Browser client for bespoke (Event / Business Class) quote requests.
 * Owner calls send the key ONLY in the X-Owner-Key header — never in the URL.
 */
import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type {
  BespokeQuoteCategory,
  BespokeQuoteOwnerSummary,
  BespokeQuotePublicView,
  BespokeQuoteRecord,
  BespokeQuoteStatus,
} from "../../shared/bespoke-quote";

const WORKER_BASE = resolveWorkerBaseUrl();

export type BespokeOwnerView = Omit<BespokeQuoteRecord, "quote"> & {
  quote?: Omit<NonNullable<BespokeQuoteRecord["quote"]>, "tokenHash">;
  statusLabel: string;
  estimatedProfitGbp: number | null;
};

export type BespokeNotification = {
  key: string;
  kind: string;
  status: "sending" | "sent" | "failed" | "skipped";
  claimedAt: string;
  finishedAt?: string;
  provider?: string;
  error?: string;
};

export type BespokeOwnerActionInput =
  | { type: "owner_start_review" }
  | {
      type: "owner_update_availability";
      availability: "unknown" | "checking" | "available" | "unavailable";
      availabilityNote?: string;
      driverName?: string;
      vehicleNote?: string;
    }
  | { type: "owner_set_costs"; estimatedDriverCostGbp: number | null; estimatedOtherCostsGbp: number | null; internalNotes?: string }
  | { type: "owner_issue_quote"; amountGbp: number; validityHours: number; customerMessage?: string }
  | { type: "resend_quote_email" }
  | { type: "owner_decline"; note?: string }
  | { type: "owner_cancel"; note?: string }
  | { type: "owner_resolve_review"; resolution: "accept_payment" | "manual_refund_required"; note: string }
  | { type: "owner_record_manual_refund"; paymentReference: string; note: string };

export class BespokeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

function ownerHeaders(ownerKey: string): HeadersInit {
  return { Accept: "application/json", "Content-Type": "application/json", "X-Owner-Key": ownerKey.trim() };
}

async function parse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!response.ok) throw new BespokeApiError(data.error || `Request failed (${response.status})`, response.status, data.code);
  return data;
}

export async function fetchOwnerBespokeRequests(
  ownerKey: string,
  filters: { category?: BespokeQuoteCategory; status?: BespokeQuoteStatus; cursor?: string } = {},
): Promise<{ items: BespokeQuoteOwnerSummary[]; cursor?: string; publicEnabled: boolean }> {
  const url = new URL(`${WORKER_BASE}/owner/bespoke-quotes`);
  if (filters.category) url.searchParams.set("category", filters.category);
  if (filters.status) url.searchParams.set("status", filters.status);
  if (filters.cursor) url.searchParams.set("cursor", filters.cursor);
  url.searchParams.set("limit", "100");
  return parse(await fetch(url.toString(), { headers: ownerHeaders(ownerKey), cache: "no-store" }));
}

export async function fetchOwnerBespokeRequest(
  ownerKey: string,
  reference: string,
): Promise<{ request: BespokeOwnerView; notifications: BespokeNotification[] }> {
  const url = new URL(`${WORKER_BASE}/owner/bespoke-quotes/detail`);
  url.searchParams.set("reference", reference);
  return parse(await fetch(url.toString(), { headers: ownerHeaders(ownerKey), cache: "no-store" }));
}

export async function postOwnerBespokeAction(
  ownerKey: string,
  input: { reference: string; expectedVersion: number; idempotencyKey: string; action: BespokeOwnerActionInput },
): Promise<{
  request: BespokeOwnerView;
  notifications: BespokeNotification[];
  changed: boolean;
  replayed?: boolean;
  customerLink?: string;
  email?: { key: string; status: string };
}> {
  return parse(
    await fetch(`${WORKER_BASE}/owner/bespoke-quotes/action`, {
      method: "POST",
      headers: ownerHeaders(ownerKey),
      body: JSON.stringify(input),
    }),
  );
}

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

// ---------------------------------------------------------------------------
// Customer quotation page
// ---------------------------------------------------------------------------

export async function fetchBespokeQuotation(
  token: string,
): Promise<{ quote: BespokeQuotePublicView; paymentAvailable: boolean }> {
  return parse(
    await fetch(`${WORKER_BASE}/bespoke-quotes/view`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      referrerPolicy: "no-referrer",
      cache: "no-store",
    }),
  );
}

export async function declineBespokeQuotation(
  token: string,
): Promise<{ quote: BespokeQuotePublicView; paymentAvailable: boolean }> {
  return parse(
    await fetch(`${WORKER_BASE}/bespoke-quotes/decline`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      referrerPolicy: "no-referrer",
    }),
  );
}
