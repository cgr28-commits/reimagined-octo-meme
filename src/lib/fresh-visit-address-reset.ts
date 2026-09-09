/**
 * Safer quote-address policy: leaving the website and coming back starts
 * with empty pickup/destination fields. Customers search again.
 *
 * Tab switches, phone lock, React rerenders, and booking-step navigation
 * must not wipe an in-progress quote. Paid SumUp return / confirmation
 * recovery must not be touched.
 */

import {
  clearDropoffAddressStorage,
  clearPickupAddressStorage,
  readConfirmedDropoffPlace,
  readConfirmedPickupPlace,
  readStoredDropoffAddressLabel,
  readStoredPickupAddressLabel,
} from "@/lib/address-place-storage";
import {
  readBookingFormDraft,
  stripAddressesFromBookingFormDraft,
  type BookingFormDraft,
} from "@/lib/booking-draft-storage";
import { emptySelectedPlace, type SelectedPlace } from "@/lib/selected-place";

export type QuoteAddressResetTrigger =
  | "fresh-load"
  | "pageshow-bfcache"
  | "pageshow-normal"
  | "visibility-change"
  | "quote-step-navigation"
  | "react-rerender";

export type QuoteAddressResetContext = {
  trigger: QuoteAddressResetTrigger;
  pathname?: string;
  search?: string;
  returnOfferToken?: string;
};

export type QuoteAddressSessionSnapshot = {
  pickupAddress: string;
  dropoffAddress: string;
  pickupPlace: SelectedPlace | null;
  dropoffPlace: SelectedPlace | null;
  routeMetrics: { distanceKm: number; durationMinutes: number } | null;
  calculatedQuote: { amount: number } | null;
  passengers: number | null;
  suitcases: number | null;
  airportDirection: "to-airport" | "from-airport" | null;
  airportCode: string;
};

export type QuoteAddressResetDecision = {
  /** Wipe leftover address text / places from localStorage + session draft. */
  clearStoredAddresses: boolean;
  /** Blank visible pickup/destination fields and invalidate route/price. */
  blankVisibleAddressFields: boolean;
  reason:
    | "fresh-visit"
    | "bfcache-restore"
    | "payment-return"
    | "return-offer"
    | "visibility-change"
    | "quote-step-navigation"
    | "active-session";
};

const BOOKING_CONFIRMED_PATH = "/booking-confirmed";

export function isProtectedPaymentReturnContext(input: {
  pathname?: string;
  search?: string;
}): boolean {
  const rawPath = (input.pathname || "").split("?")[0] || "/";
  const path = rawPath.replace(/\/+$/, "") || "/";
  if (path === BOOKING_CONFIRMED_PATH) {
    return true;
  }

  const params = new URLSearchParams(input.search || "");
  if (params.get("payment") === "return") {
    return true;
  }
  if (params.get("return_token")?.trim()) {
    return true;
  }
  if (params.get("checkout_id")?.trim() || params.get("checkoutId")?.trim()) {
    return true;
  }
  return false;
}

export function decideQuoteAddressReset(
  ctx: QuoteAddressResetContext,
): QuoteAddressResetDecision {
  if (isProtectedPaymentReturnContext(ctx)) {
    return {
      clearStoredAddresses: false,
      blankVisibleAddressFields: false,
      reason: "payment-return",
    };
  }

  const hasReturnOffer = Boolean(ctx.returnOfferToken?.trim());

  switch (ctx.trigger) {
    case "fresh-load":
      // Always drop leftover stored addresses. Landing-page / return-offer
      // props stay in React initial state — we just refuse to rehydrate
      // from localStorage or an old SumUp session draft.
      return {
        clearStoredAddresses: true,
        blankVisibleAddressFields: false,
        reason: hasReturnOffer ? "return-offer" : "fresh-visit",
      };
    case "pageshow-bfcache":
      if (hasReturnOffer) {
        return {
          clearStoredAddresses: true,
          blankVisibleAddressFields: false,
          reason: "return-offer",
        };
      }
      return {
        clearStoredAddresses: true,
        blankVisibleAddressFields: true,
        reason: "bfcache-restore",
      };
    case "visibility-change":
      return {
        clearStoredAddresses: false,
        blankVisibleAddressFields: false,
        reason: "visibility-change",
      };
    case "quote-step-navigation":
      return {
        clearStoredAddresses: false,
        blankVisibleAddressFields: false,
        reason: "quote-step-navigation",
      };
    case "pageshow-normal":
    case "react-rerender":
    default:
      return {
        clearStoredAddresses: false,
        blankVisibleAddressFields: false,
        reason: "active-session",
      };
  }
}

export function decideQuoteAddressResetFromPageShow(input: {
  persisted: boolean;
  pathname?: string;
  search?: string;
  returnOfferToken?: string;
}): QuoteAddressResetDecision {
  return decideQuoteAddressReset({
    trigger: input.persisted ? "pageshow-bfcache" : "pageshow-normal",
    pathname: input.pathname,
    search: input.search,
    returnOfferToken: input.returnOfferToken,
  });
}

/**
 * A later visit must not show leftover address text or structured places,
 * regardless of what localStorage / session draft still hold.
 */
export function resolveAddressesForFreshVisit(input: {
  storedPickupLabel?: string;
  storedDropoffLabel?: string;
  storedPickupPlace?: SelectedPlace | null;
  storedDropoffPlace?: SelectedPlace | null;
  draft?: Pick<
    BookingFormDraft,
    "pickupAddress" | "dropoffAddress" | "pickupPlace" | "dropoffPlace"
  > | null;
}): {
  pickupAddress: string;
  dropoffAddress: string;
  pickupPlace: SelectedPlace | null;
  dropoffPlace: SelectedPlace | null;
} {
  void input;
  return {
    pickupAddress: "",
    dropoffAddress: "",
    pickupPlace: null,
    dropoffPlace: null,
  };
}

export function blankVisibleQuoteAddressFields(
  snapshot: QuoteAddressSessionSnapshot,
): QuoteAddressSessionSnapshot {
  return {
    ...snapshot,
    pickupAddress: "",
    dropoffAddress: "",
    pickupPlace: null,
    dropoffPlace: null,
    routeMetrics: null,
    calculatedQuote: null,
  };
}

export function applyQuoteAddressResetDecision(
  snapshot: QuoteAddressSessionSnapshot,
  decision: QuoteAddressResetDecision,
): QuoteAddressSessionSnapshot {
  if (!decision.blankVisibleAddressFields) {
    return snapshot;
  }
  return blankVisibleQuoteAddressFields(snapshot);
}

/** Keys this helper is allowed to remove — never payment / consent / owner keys. */
export const FRESH_VISIT_ADDRESS_STORAGE_KEYS = {
  local: [
    "my-airport-taxi-ni-pickup-address",
    "my-airport-taxi-ni-dropoff-address",
    "my-airport-taxi-ni-pickup-place-v1",
    "my-airport-taxi-ni-dropoff-place-v1",
  ],
  preserved: [
    "matni-pending-payment",
    "matni-open-checkout-v1",
    "matni-cookie-consent",
    "matni-owner-key",
    "matni-driver-key",
  ],
  preservedPrefixes: [
    "matni-pending-token-",
    "matni-payment-confirmed-",
    "matni-payment-summary-",
    "matni-payment-result-",
  ],
} as const;

export function clearStoredQuoteAddresses(): void {
  clearPickupAddressStorage();
  clearDropoffAddressStorage();
  stripAddressesFromBookingFormDraft();
}

export function readLeftoverStoredQuoteAddresses(): {
  pickupLabel: string;
  dropoffLabel: string;
  pickupPlace: SelectedPlace | null;
  dropoffPlace: SelectedPlace | null;
  draftPickupAddress: string;
  draftDropoffAddress: string;
  draftPickupPlace: SelectedPlace | null;
  draftDropoffPlace: SelectedPlace | null;
} {
  const draft = readBookingFormDraft();
  return {
    pickupLabel: readStoredPickupAddressLabel(),
    dropoffLabel: readStoredDropoffAddressLabel(),
    pickupPlace: readConfirmedPickupPlace(),
    dropoffPlace: readConfirmedDropoffPlace(),
    draftPickupAddress: draft?.pickupAddress?.trim() ?? "",
    draftDropoffAddress: draft?.dropoffAddress?.trim() ?? "",
    draftPickupPlace: draft?.pickupPlace ?? null,
    draftDropoffPlace: draft?.dropoffPlace ?? null,
  };
}

export function emptyQuoteAddressPlace(): SelectedPlace {
  return emptySelectedPlace();
}
