/** Owner dashboard client for the inbox and "Email customer". */
import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type { InboxMessage, InboxThreadSummary } from "../../shared/owner-inbox";

const WORKER_BASE = resolveWorkerBaseUrl();

export type InboxListResponse = {
  connected: boolean;
  /** A full-access Resend key is saved (needed to read email bodies). */
  readKey: boolean;
  receivingAddress: string | null;
  connection: { source: "api" | "manual"; createdAt: string } | null;
  lastReceivedAt: string | null;
  threads: InboxThreadSummary[];
};

export type InboxThreadBooking = {
  paymentReference: string;
  reference: string;
  tripDate: string;
  tripTime: string;
  route: string;
};

export type InboxThreadResponse = { messages: InboxMessage[]; bookings: InboxThreadBooking[] };

export async function ownerInboxFetch<T>(ownerKey: string, path: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${WORKER_BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error || "Something went wrong");
  return payload;
}
