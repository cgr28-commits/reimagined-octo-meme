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
  terminalAccessChoices?: import("../../shared/meet-greet").TerminalAccessChoices;
  outboundAirportAccessChoice?: "express" | "free" | "meet-greet";
  returnAirportAccessChoice?: "express" | "free" | "meet-greet";
  savedAt?: string;
};

export type OpenCheckoutSession = {
  paymentUrl: string;
  checkoutId: string;
  checkoutReference?: string;
  amountLabel: string;
  returnToken?: string;
  openedAt: string;
  /** Journey and price this link was created for; a different quote never resumes it. */
  journeyKey?: string;
};

/** What identifies the journey a saved payment link belongs to. */
export type OpenCheckoutJourney = {
  pickupAddress: string;
  dropoffAddress: string;
  tripDate: string;
  tripTime: string;
  journeyMode: string | null;
  returnDate: string;
  returnTime: string;
  vehicle: string | null;
  amountLabel: string;
};

export function buildOpenCheckoutJourneyKey(journey: OpenCheckoutJourney): string {
  return JSON.stringify([
    journey.pickupAddress.trim(),
    journey.dropoffAddress.trim(),
    journey.tripDate,
    journey.tripTime,
    journey.journeyMode ?? "",
    journey.returnDate,
    journey.returnTime,
    journey.vehicle ?? "",
    journey.amountLabel,
  ]);
}

/**
 * The saved "Secure payment ready" link is only offered for the journey and price it was made
 * for. Links saved before this check existed (no journeyKey) are never offered again.
 */
export function openCheckoutForJourney<T extends { journeyKey?: string }>(
  session: T | null,
  journeyKey: string,
): T | null {
  return session && session.journeyKey === journeyKey ? session : null;
}

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

/**
 * Keep passenger / airport / contact draft fields, but drop leftover addresses
 * so a later visit cannot refill the quote form from sessionStorage.
 */
export function stripAddressesFromBookingFormDraft(): BookingFormDraft | null {
  const draft = readBookingFormDraft();
  if (!draft) {
    return null;
  }
  const stripped: BookingFormDraft = {
    ...draft,
    pickupAddress: "",
    dropoffAddress: "",
    pickupPlace: null,
    dropoffPlace: null,
  };
  saveBookingFormDraft(stripped);
  return stripped;
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

/**
 * Same-tab marker set just before the customer leaves for the payment page. When they come
 * back (browser Back or "Back to booking"), the quote restores their journey from the saved
 * draft instead of applying the fresh-visit address reset. sessionStorage is per tab, so a
 * later visit in a new tab still starts empty. Expires after two hours.
 */
const PAYMENT_HANDOFF_KEY = "matni-payment-handoff";
const PAYMENT_HANDOFF_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export function markPaymentHandoff(): void {
  try {
    window.sessionStorage.setItem(PAYMENT_HANDOFF_KEY, String(Date.now()));
  } catch {
    /* storage unavailable: the fresh-visit reset applies as before */
  }
}

export function clearPaymentHandoff(): void {
  try {
    window.sessionStorage.removeItem(PAYMENT_HANDOFF_KEY);
  } catch {
    /* ignore */
  }
}

/** True once per return from the payment page (the marker is removed when read). */
export function consumePaymentHandoff(now = Date.now()): boolean {
  try {
    const raw = window.sessionStorage.getItem(PAYMENT_HANDOFF_KEY);
    if (!raw) return false;
    window.sessionStorage.removeItem(PAYMENT_HANDOFF_KEY);
    const at = Number(raw);
    return Number.isFinite(at) && now - at >= 0 && now - at <= PAYMENT_HANDOFF_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/** Peek without consuming (used by the browser back-forward cache path). */
export function hasPaymentHandoff(now = Date.now()): boolean {
  try {
    const at = Number(window.sessionStorage.getItem(PAYMENT_HANDOFF_KEY));
    return Number.isFinite(at) && at > 0 && now - at <= PAYMENT_HANDOFF_MAX_AGE_MS;
  } catch {
    return false;
  }
}
