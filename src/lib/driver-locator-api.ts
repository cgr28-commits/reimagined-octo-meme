/**
 * Browser client for Find Your Driver (/locator/* on the Worker).
 * Credentials travel in headers only (never in URLs). Responses are no-store.
 */
import type { CustomerLocatorView, DriverLocatorStatus, LocatorWindow } from "../../shared/driver-locator";

const DEFAULT_WORKER_BASE = "https://reimagined-octo-meme.cgr28.workers.dev";

function workerBase(): string {
  const configured = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";
  if (!configured) return DEFAULT_WORKER_BASE;
  try {
    const host = new URL(configured).hostname.toLowerCase();
    if (host === "www.myairporttaxini.co.uk" || host === "myairporttaxini.co.uk") return DEFAULT_WORKER_BASE;
    return configured.replace(/\/bookings\/?$/i, "");
  } catch {
    return DEFAULT_WORKER_BASE;
  }
}

function authHeaders(key: string): Record<string, string> {
  const trimmed = key.trim();
  if (!trimmed) return {};
  return trimmed.startsWith("dps_") ? { "X-Driver-Session": trimmed } : { "X-Driver-Key": trimmed };
}

export type LocatorResult<T> =
  | ({ ok: true; httpStatus: number } & T)
  | { ok: false; httpStatus: number; error: string; code?: string; retryable?: boolean; window?: LocatorWindow };

async function post<T>(path: string, body: Record<string, unknown>, key?: string): Promise<LocatorResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${workerBase()}/locator/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(key ? authHeaders(key) : {}) },
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    return { ok: false, httpStatus: 0, error: "No connection", retryable: true };
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data.ok !== true) {
    return {
      ok: false,
      httpStatus: response.status,
      error: typeof data.error === "string" ? data.error : "Live location is unavailable",
      code: typeof data.code === "string" ? data.code : undefined,
      retryable: response.status === 0 || response.status === 429 || response.status >= 500,
      window: data.window as LocatorWindow | undefined,
    };
  }
  return { ...(data as T), ok: true, httpStatus: response.status } as LocatorResult<T>;
}

export type LocatorProbe = { enabled: boolean; mode: string; role: "owner" | "driver" };

export const locatorApi = {
  probe: (key: string) => post<LocatorProbe>("driver/status", {}, key),
  status: (key: string, jobToken: string) =>
    post<DriverLocatorStatus & { withheldNearBase?: boolean }>("driver/status", { jobToken }, key),
  start: (key: string, jobToken: string) => post<{ phase: string; closesAt: string }>("driver/start", { jobToken }, key),
  position: (key: string, jobToken: string, fix: { lat: number; lng: number; accuracy: number; at: number }) =>
    post<{ stored: boolean; withheld?: boolean; throttled?: boolean; at?: string }>("driver/position", { jobToken, ...fix }, key),
  stop: (key: string, jobToken: string, reason: "stopped" | "collected") =>
    post<{ phase: string }>("driver/stop", { jobToken, reason }, key),
  createLink: (key: string, jobToken: string, meetingNote: string) =>
    post<{ url: string; fragment: string; expiresAt: string }>("owner/link", { jobToken, action: "create", meetingNote }, key),
  revokeLink: (key: string, jobToken: string) => post<{ linkActive: boolean }>("owner/link", { jobToken, action: "revoke" }, key),
  view: (link: string) => post<CustomerLocatorView>("view", { link }),
};
