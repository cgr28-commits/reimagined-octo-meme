/**
 * Browser client for Belfast event listings and public request submission.
 * Owner calls send the key ONLY in the X-Owner-Key header — never in the URL.
 */
import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type { BelfastEventPublic, BelfastEventRecord } from "../../shared/belfast-events";

const WORKER_BASE = resolveWorkerBaseUrl();

export class BelfastEventsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors?: Record<string, string>,
    readonly record?: BelfastEventRecord,
  ) {
    super(message);
  }
}

async function parse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    errors?: Record<string, string>;
    record?: BelfastEventRecord;
  };
  if (!response.ok) {
    throw new BelfastEventsApiError(data.error || `Request failed (${response.status})`, response.status, data.errors, data.record);
  }
  return data;
}

/** Live list of approved events. Returns null when the service is off or unreachable. */
export async function fetchPublicBelfastEvents(signal?: AbortSignal): Promise<BelfastEventPublic[] | null> {
  try {
    const response = await fetch(`${WORKER_BASE}/events/public`, { headers: { Accept: "application/json" }, signal });
    if (!response.ok) return null;
    const data = (await response.json()) as { events?: BelfastEventPublic[] };
    return Array.isArray(data.events) ? data.events : null;
  } catch {
    return null;
  }
}

function ownerHeaders(ownerKey: string): HeadersInit {
  return { Accept: "application/json", "Content-Type": "application/json", "X-Owner-Key": ownerKey.trim() };
}

export async function fetchOwnerBelfastEvents(ownerKey: string): Promise<{ events: BelfastEventRecord[]; publicEnabled: boolean }> {
  const response = await fetch(`${WORKER_BASE}/owner/belfast-events`, { headers: ownerHeaders(ownerKey), cache: "no-store" });
  return parse(response);
}

export type BelfastEventOwnerAction = "create" | "save" | "publish" | "unpublish" | "postpone" | "cancel";

export async function postOwnerBelfastEventAction(
  ownerKey: string,
  input: { action: BelfastEventOwnerAction; id?: string; expectedVersion?: number; fields?: Record<string, unknown> },
): Promise<{ record: BelfastEventRecord }> {
  const response = await fetch(`${WORKER_BASE}/owner/belfast-events/action`, {
    method: "POST",
    headers: ownerHeaders(ownerKey),
    body: JSON.stringify(input),
  });
  return parse(response);
}

export type BespokeRequestSubmitResult = { ok: true; reference: string; duplicate?: boolean };

export class BespokeRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** POST a public Event / Business Class request to the existing bespoke backend. */
export async function submitBespokeRequest(payload: Record<string, unknown>): Promise<BespokeRequestSubmitResult> {
  let response: Response;
  try {
    response = await fetch(`${WORKER_BASE}/bespoke-quotes/request`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new BespokeRequestError("We couldn't reach our booking system. Please check your connection and try again.", 0);
  }
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    reference?: string;
    duplicate?: boolean;
    error?: string;
    errors?: Record<string, string>;
  };
  if (!response.ok || !data.ok || !data.reference) {
    const message =
      response.status === 404
        ? "Online requests are not open yet. Please call or WhatsApp us."
        : data.error || "Something went wrong. Please try again, or call or WhatsApp us.";
    throw new BespokeRequestError(message, response.status, data.errors ?? {});
  }
  return { ok: true, reference: data.reference, duplicate: data.duplicate };
}
