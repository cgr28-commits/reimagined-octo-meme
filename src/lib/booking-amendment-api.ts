import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import type { DateTimeAmendmentAuditEntry } from "../../shared/booking-amendment";

const WORKER_BASE = resolveWorkerBaseUrl();

export type ManageBookingSummary = {
  paymentReference: string;
  customerName: string;
  tripDate: string;
  tripTime: string;
  pickupLabel: string;
  dropoffLabel: string;
  amountPaidLabel: string;
  dateTimeAmendmentCount: number;
  freeAmendmentAvailable: boolean;
  within24HoursOfPickup: boolean;
  hoursUntilPickup: number | null;
  originalTripDate?: string;
  originalTripTime?: string;
  dateTimeAmendmentHistory: DateTimeAmendmentAuditEntry[];
  within24hHeadline: string;
  within24hBody: string;
  freeAmendmentHint: string;
};

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") return {};
  return payload as Record<string, unknown>;
}

export async function lookupBookingForAmendment(input: {
  paymentReference: string;
  customerEmail: string;
}): Promise<ManageBookingSummary> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/amend-lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error || "Could not find that booking."));
  }
  return payload.booking as ManageBookingSummary;
}

export async function amendBookingSchedule(input: {
  paymentReference: string;
  customerEmail: string;
  tripDate: string;
  tripTime: string;
}): Promise<ManageBookingSummary> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/amend-schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    const err = new Error(String(payload.error || "Could not update this booking.")) as Error & {
      reason?: string;
      contactRequired?: boolean;
      headline?: string;
      body?: string;
      booking?: ManageBookingSummary;
    };
    err.reason = String(payload.reason || "");
    err.contactRequired = Boolean(payload.contactRequired);
    err.headline = payload.headline ? String(payload.headline) : undefined;
    err.body = payload.body ? String(payload.body) : undefined;
    if (payload.booking && typeof payload.booking === "object") {
      err.booking = payload.booking as ManageBookingSummary;
    }
    throw err;
  }
  return payload.booking as ManageBookingSummary;
}
