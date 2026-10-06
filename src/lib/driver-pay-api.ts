import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type { DriverJob } from "@/lib/tracking-api";

const WORKER_BASE = resolveWorkerBaseUrl();

export type DriverPayPeriod = "week" | "month" | "year";

export type DriverPayOutstandingItem = {
  token: string;
  tripDate: string;
  driverName: string;
  pickupLabel: string;
  dropoffLabel: string;
  amountPence: number;
  amountLabel: string;
  bookingReference?: string;
  journeyLeg?: "outbound" | "return";
};

export type OwnerDriverPaySummary = {
  ok: true;
  outstandingPence: number;
  outstandingLabel: string;
  paidPence: number;
  paidLabel: string;
  period: DriverPayPeriod;
  periodLabel: string;
  periodFrom: string;
  periodTo: string;
  outstanding: DriverPayOutstandingItem[];
};

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload || typeof payload !== "object") {
    throw new Error("The driver payment request failed");
  }
  if (!response.ok) {
    throw new Error(String(payload.error ?? "The driver payment request failed"));
  }
  return payload;
}

export async function fetchOwnerDriverPayments(
  ownerKey: string,
  period: DriverPayPeriod,
): Promise<OwnerDriverPaySummary> {
  const url = new URL(`${WORKER_BASE}/owner/driver-payments`);
  url.searchParams.set("period", period);
  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    cache: "no-store",
  });
  return (await parseJson(response)) as OwnerDriverPaySummary;
}

export async function recordDriverAsPaid(
  ownerKey: string,
  input: { token: string; method: "bank_transfer" | "cash" | "other"; reference?: string },
): Promise<{ job: DriverJob; idempotent: boolean }> {
  const response = await fetch(`${WORKER_BASE}/owner/driver-payments/record`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({
      token: input.token,
      method: input.method,
      reference: input.reference?.trim() || undefined,
    }),
  });
  const payload = await parseJson(response);
  return { job: payload.job as DriverJob, idempotent: Boolean(payload.idempotent) };
}

export async function correctDriverPayToUnpaid(
  ownerKey: string,
  token: string,
): Promise<{ job: DriverJob }> {
  const response = await fetch(`${WORKER_BASE}/owner/driver-payments/correct`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
    body: JSON.stringify({ token }),
  });
  const payload = await parseJson(response);
  return { job: payload.job as DriverJob };
}
