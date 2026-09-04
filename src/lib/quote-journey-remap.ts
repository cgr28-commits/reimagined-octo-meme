import type { QuoteJourneyIntent } from "@/lib/quote-journey-intent";
import {
  detectAirportCodeFromPlace,
  emptySelectedPlace,
  isQuoteReadyPlace,
  type SelectedPlace,
} from "@/lib/selected-place";

export type RemapJourneyPlacesInput = {
  nextIntent: QuoteJourneyIntent;
  pickup: SelectedPlace;
  dropoff: SelectedPlace;
  pickupAddress: string;
  dropoffAddress: string;
};

export type RemapJourneyPlacesResult = {
  pickup: SelectedPlace;
  dropoff: SelectedPlace;
  pickupAddress: string;
  dropoffAddress: string;
  pickupNeedsReselect: boolean;
  dropoffNeedsReselect: boolean;
};

function isAirportPlace(place: SelectedPlace): boolean {
  return Boolean(detectAirportCodeFromPlace(place));
}

function hasUsableLocalPlace(place: SelectedPlace, address: string): boolean {
  if (isAirportPlace(place)) return false;
  return isQuoteReadyPlace(place) || Boolean(address.trim());
}

function localCandidate(
  first: { place: SelectedPlace; address: string },
  second: { place: SelectedPlace; address: string },
): { place: SelectedPlace; address: string } | null {
  if (hasUsableLocalPlace(first.place, first.address)) return first;
  if (hasUsableLocalPlace(second.place, second.address)) return second;
  return null;
}

function airportCandidate(
  first: { place: SelectedPlace; address: string },
  second: { place: SelectedPlace; address: string },
): { place: SelectedPlace; address: string } | null {
  if (isAirportPlace(first.place)) return first;
  if (isAirportPlace(second.place)) return second;
  return null;
}

/**
 * When the customer changes To / From / Address-to-address, keep a genuine
 * local address in the correct slot and never leave an airport in the
 * customer address field.
 */
export function remapPlacesForJourneyIntent(
  input: RemapJourneyPlacesInput,
): RemapJourneyPlacesResult {
  const empty = emptySelectedPlace();
  const pickupSlot = { place: input.pickup, address: input.pickupAddress };
  const dropoffSlot = { place: input.dropoff, address: input.dropoffAddress };

  if (input.nextIntent === "address-to-address") {
    const pickupAirport = isAirportPlace(input.pickup);
    const dropoffAirport = isAirportPlace(input.dropoff);
    return {
      pickup: pickupAirport ? empty : input.pickup,
      dropoff: dropoffAirport ? empty : input.dropoff,
      pickupAddress: pickupAirport ? "" : input.pickupAddress,
      dropoffAddress: dropoffAirport ? "" : input.dropoffAddress,
      pickupNeedsReselect: pickupAirport,
      dropoffNeedsReselect: dropoffAirport,
    };
  }

  const local = localCandidate(
    input.nextIntent === "to-airport" ? pickupSlot : dropoffSlot,
    input.nextIntent === "to-airport" ? dropoffSlot : pickupSlot,
  );
  const airport = airportCandidate(
    input.nextIntent === "to-airport" ? dropoffSlot : pickupSlot,
    input.nextIntent === "to-airport" ? pickupSlot : dropoffSlot,
  );

  if (input.nextIntent === "to-airport") {
    return {
      pickup: local?.place ?? empty,
      dropoff: airport?.place ?? empty,
      pickupAddress: local?.address ?? "",
      dropoffAddress: airport?.address ?? "",
      pickupNeedsReselect: !local,
      dropoffNeedsReselect: false,
    };
  }

  return {
    pickup: airport?.place ?? empty,
    dropoff: local?.place ?? empty,
    pickupAddress: airport?.address ?? "",
    dropoffAddress: local?.address ?? "",
    pickupNeedsReselect: false,
    dropoffNeedsReselect: !local,
  };
}
