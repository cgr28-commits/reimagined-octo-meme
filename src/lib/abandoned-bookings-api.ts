/**
 * Client helpers for abandoned booking recovery (capture / resume / owner list).
 */

import type {
  AbandonedBookingOwnerView,
  AbandonedBookingPublicResume,
  AbandonedBookingJourneySnapshot,
} from "../../shared/abandoned-booking-recovery";

export type {
  AbandonedBookingOwnerView,
  AbandonedBookingPublicResume,
  AbandonedBookingJourneySnapshot,
};

const DEFAULT_WORKER_BASE = "https://reimagined-octo-meme.cgr28.workers.dev";

function resolveWorkerBaseUrl(): string {
  const bookings = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";
  if (bookings) {
    try {
      const url = new URL(bookings);
      return url.origin;
    } catch {
      return DEFAULT_WORKER_BASE;
    }
  }
  return DEFAULT_WORKER_BASE;
}

const WORKER_BASE = resolveWorkerBaseUrl();

export type AbandonedBookingCaptureInput = {
  customerName?: string;
  customerEmail: string;
  mobileNumber?: string;
  journey: AbandonedBookingJourneySnapshot;
  checkoutId?: string;
  checkoutReference?: string;
  quoteReference?: string;
};

export async function captureAbandonedBooking(
  input: AbandonedBookingCaptureInput,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    const response = await fetch(`${WORKER_BASE}/abandoned-bookings/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return {
        ok: false,
        error: typeof payload.error === "string" ? payload.error : "Capture failed",
      };
    }
    return {
      ok: true,
      token: typeof payload.token === "string" ? payload.token : undefined,
    };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function fetchAbandonedBookingByToken(
  token: string,
): Promise<AbandonedBookingPublicResume | null> {
  const response = await fetch(
    `${WORKER_BASE}/abandoned-bookings/by-token?t=${encodeURIComponent(token.trim())}`,
  );
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    booking?: AbandonedBookingPublicResume;
  };
  return payload.booking ?? null;
}

export async function optOutAbandonedBookingRecovery(
  token: string,
): Promise<boolean> {
  const response = await fetch(`${WORKER_BASE}/abandoned-bookings/opt-out`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return response.ok;
}

export async function fetchOwnerAbandonedBookings(
  ownerKey: string,
  opts?: { limit?: number },
): Promise<AbandonedBookingOwnerView[]> {
  const limit = opts?.limit ?? 40;
  const response = await fetch(
    `${WORKER_BASE}/abandoned-bookings?limit=${encodeURIComponent(String(limit))}`,
    {
      headers: {
        "X-Owner-Key": ownerKey,
      },
    },
  );
  if (!response.ok) {
    throw new Error("Could not load abandoned bookings");
  }
  const payload = (await response.json()) as {
    bookings?: AbandonedBookingOwnerView[];
  };
  return Array.isArray(payload.bookings) ? payload.bookings : [];
}
