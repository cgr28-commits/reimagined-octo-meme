/**
 * "Quote again": carries a customer's details from a booking (or a past quote)
 * into the owner's Personal Quotes form. Owner dashboard only; kept in this
 * browser tab's sessionStorage and read once.
 */

import type { PersonalQuoteJourney } from "../../shared/personal-quote";

export type PersonalQuotePrefill = {
  customerName?: string;
  customerEmail?: string;
  customerMobile?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  journey?: PersonalQuoteJourney;
};

const KEY = "owner:personal-quote-prefill";

export function savePersonalQuotePrefill(prefill: PersonalQuotePrefill): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(prefill));
  } catch {
    // Storage unavailable: the owner can still type the details.
  }
}

export function consumePersonalQuotePrefill(): PersonalQuotePrefill | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as PersonalQuotePrefill) : null;
  } catch {
    return null;
  }
}

/** Build a prefill from a booking record (any shape with the usual booking fields). */
export function personalQuotePrefillFromBooking(booking: {
  customerName?: unknown;
  customerEmail?: unknown;
  mobileNumber?: unknown;
  pickupLabel?: unknown;
  dropoffLabel?: unknown;
  passengers?: unknown;
  suitcases?: unknown;
  vehicle?: unknown;
  returnJourney?: unknown;
}): PersonalQuotePrefill {
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  const passengers = Number(booking.passengers);
  const suitcases = Number(booking.suitcases);
  const vehicle = text(booking.vehicle);
  return {
    customerName: text(booking.customerName),
    customerEmail: text(booking.customerEmail),
    customerMobile: text(booking.mobileNumber),
    pickupLabel: text(booking.pickupLabel),
    dropoffLabel: text(booking.dropoffLabel),
    ...(Number.isFinite(passengers) && passengers >= 1 && vehicle
      ? {
          journey: {
            passengers,
            suitcases: Number.isFinite(suitcases) && suitcases >= 0 ? suitcases : 0,
            vehicle,
            returnJourney: booking.returnJourney === true,
          },
        }
      : {}),
  };
}
