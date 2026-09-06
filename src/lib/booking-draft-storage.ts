/**
 * Persist quote + customer details while SumUp is open in another tab.
 * Session storage keeps the original booking page recoverable after tab switches.
 */

import type { SelectedPlace } from "@/lib/selected-place";
import { isQuoteReadyPlace } from "@/lib/selected-place";
import type { QuoteJourneyIntent, CustomerAirportCode } from "@/lib/quote-journey-intent";
import type { VehicleType } from "@/lib/data";

const BOOKING_DRAFT_KEY = "matni-booking-draft-v1";
const OPEN_CHECKOUT_KEY = "matni-open-checkout-v1";

export type BookingFormDraft = {
  quoteStep?: 1 | 2 | 3;
  pickupAddress?: string;
  dropoffAddress?: string;
  pickupPlace?: SelectedPlace | null;
  dropoffPlace?: SelectedPlace | null;
  tripDate?: string;
  tripTime?: string;
  returnJourney?: boolean;
  /** Explicit One Way / Return — preferred over inferring from returnJourney alone. */
  journeyMode?: "one-way" | "return";
  returnDate?: string;
  returnTime?: string;
  passengers?: number;
  suitcases?: number;
  exactPassengers?: number | null;
  childSeats?: number;
  childSeatNotes?: string;
  vehicle?: VehicleType | string;
  customerName?: string;
  customerEmail?: string;
  customerMobile?: string;
  goingFlightNumber?: string;
  collectionFlightNumber?: string;
  journeyIntent?: QuoteJourneyIntent | null;
  intentAirportCode?: CustomerAirportCode | "";
  termsAccepted?: boolean;
  marketingOptIn?: boolean;
  /** Persist code only — amount is always re-validated from the server on restore. */
  personalQuoteCode?: string;
  /** Customer Express Drop-Off choice — restored across SumUp tab switches. */
  expressDropOffSelected?: boolean;
  returnExpressDropOffSelected?: boolean;
  savedAt?: string;
};

export type OpenCheckoutSession = {
  paymentUrl: string;
  checkoutId: string;
  checkoutReference?: string;
  amountLabel: string;
  returnToken?: string;
  openedAt: string;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

export function saveBookingFormDraft(draft: BookingFormDraft): void {
  if (!canUseStorage()) {
    return;
  }
  try {
    const pickupPlace =
      draft.pickupPlace && isQuoteReadyPlace(draft.pickupPlace) ? draft.pickupPlace : null;
    const dropoffPlace =
      draft.dropoffPlace && isQuoteReadyPlace(draft.dropoffPlace) ? draft.dropoffPlace : null;
    sessionStorage.setItem(
      BOOKING_DRAFT_KEY,
      JSON.stringify({
        ...draft,
        pickupPlace,
        dropoffPlace,
        savedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Ignore quota / private mode failures — in-memory React state still holds the form.
  }
}

export function readBookingFormDraft(): BookingFormDraft | null {
  if (!canUseStorage()) {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(BOOKING_DRAFT_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as BookingFormDraft;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    // Never restore incomplete Places as confirmed — text alone is not enough.
    const pickupPlace =
      parsed.pickupPlace &&
      typeof parsed.pickupPlace === "object" &&
      isQuoteReadyPlace(parsed.pickupPlace)
        ? parsed.pickupPlace
        : null;
    const dropoffPlace =
      parsed.dropoffPlace &&
      typeof parsed.dropoffPlace === "object" &&
      isQuoteReadyPlace(parsed.dropoffPlace)
        ? parsed.dropoffPlace
        : null;
    return {
      ...parsed,
      pickupPlace,
      dropoffPlace,
    };
  } catch {
    return null;
  }
}

export function clearBookingFormDraft(): void {
  if (!canUseStorage()) {
    return;
  }
  try {
    sessionStorage.removeItem(BOOKING_DRAFT_KEY);
  } catch {
    // ignore
  }
}

export function saveOpenCheckoutSession(session: OpenCheckoutSession): void {
  if (!canUseStorage()) {
    return;
  }
  try {
    sessionStorage.setItem(OPEN_CHECKOUT_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function readOpenCheckoutSession(): OpenCheckoutSession | null {
  if (!canUseStorage()) {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(OPEN_CHECKOUT_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as OpenCheckoutSession;
    if (!parsed?.paymentUrl || !parsed?.checkoutId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearOpenCheckoutSession(): void {
  if (!canUseStorage()) {
    return;
  }
  try {
    sessionStorage.removeItem(OPEN_CHECKOUT_KEY);
  } catch {
    // ignore
  }
}
