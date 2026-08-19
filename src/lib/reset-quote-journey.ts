/**
 * Clear persistence for an abandoned *unconfirmed* quote/booking journey.
 * Does not touch cookie consent, owner/driver keys, manage-booking amend state,
 * or completed SumUp confirmation markers for paid bookings.
 */

import {
  clearDropoffAddressStorage,
  clearPickupAddressStorage,
} from "@/lib/address-place-storage";
import {
  clearBookingFormDraft,
  clearOpenCheckoutSession,
  readOpenCheckoutSession,
} from "@/lib/booking-draft-storage";
import { clearPendingPayment } from "@/lib/pending-payment";

/** Dispatched after Start a New Quote so other quote UIs (e.g. assistant) can reset. */
export const START_NEW_QUOTE_EVENT = "matni-start-new-quote";

const QUOTE_ASSISTANT_KEY = "matni-quote-assistant-v1";
const PREFILL_AIRPORT_KEY = "my-airport-taxi-ni-prefill-airport";
const PREFILL_QUOTE_DRAFT_KEY = "my-airport-taxi-ni-prefill-quote-draft";
const TEST_BOOKING_KEY = "matni-test-booking-v1";

function safeRemoveSession(key: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function safeRemoveLocal(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Strip payment-return query params so a refresh does not re-enter SumUp return flow
 * for an abandoned unconfirmed checkout. Leaves hash (e.g. #quote) intact.
 */
export function clearAbandonedQuoteUrlParams(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    let dirty = false;
    for (const key of ["payment", "return_token", "checkout_id", "checkoutId"]) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        dirty = true;
      }
    }
    if (dirty) {
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, "", next);
    }
  } catch {
    // ignore
  }
}

/**
 * Clear quote-related storage only. Safe for Start a New Quote.
 * Confirmed payment result keys (matni-payment-confirmed-*) are intentionally kept.
 */
export function clearAbandonedQuotePersistence(): void {
  const open = typeof window !== "undefined" ? readOpenCheckoutSession() : null;
  clearPickupAddressStorage();
  clearDropoffAddressStorage();
  clearBookingFormDraft();
  clearOpenCheckoutSession();
  try {
    clearPendingPayment(open?.returnToken);
    clearPendingPayment();
  } catch {
    // ignore
  }
  safeRemoveSession(QUOTE_ASSISTANT_KEY);
  safeRemoveSession(PREFILL_AIRPORT_KEY);
  safeRemoveSession(PREFILL_QUOTE_DRAFT_KEY);
  safeRemoveSession(TEST_BOOKING_KEY);
  clearAbandonedQuoteUrlParams();
  try {
    window.dispatchEvent(new Event(START_NEW_QUOTE_EVENT));
  } catch {
    // ignore
  }
}

/** Keys cleared by {@link clearAbandonedQuotePersistence} — for regression checks. */
export const ABANDONED_QUOTE_STORAGE_KEYS = {
  session: [
    "matni-booking-draft-v1",
    "matni-open-checkout-v1",
    QUOTE_ASSISTANT_KEY,
    PREFILL_AIRPORT_KEY,
    PREFILL_QUOTE_DRAFT_KEY,
    TEST_BOOKING_KEY,
  ],
  local: [
    "my-airport-taxi-ni-pickup-address",
    "my-airport-taxi-ni-dropoff-address",
    "my-airport-taxi-ni-pickup-place-v1",
    "my-airport-taxi-ni-dropoff-place-v1",
    "matni-pending-payment",
  ],
  preservedPrefixes: [
    "matni-payment-confirmed-",
    "matni-payment-summary-",
    "matni-payment-result-",
    "matni-cookie-consent",
    "matni-owner-key",
    "matni-driver-key",
  ],
} as const;
