/**
 * Reset dependent quote fields when the customer changes journey direction.
 * Does not touch name, phone, email, passengers, or luggage.
 */

export type QuoteJourneyDirectionIntent =
  | "from-airport"
  | "to-airport"
  | "address-to-address";

export type JourneyDirectionResetPlan = {
  clearPickup: boolean;
  clearDropoff: boolean;
  clearGoingFlight: boolean;
  clearCollectionFlight: boolean;
  clearAirportSelection: boolean;
  applyAirportTo: "pickup" | "dropoff" | null;
};

export type JourneyDirectionFormSnapshot = {
  pickupAddress: string;
  dropoffAddress: string;
  pickupIsAirport: boolean;
  dropoffIsAirport: boolean;
  goingFlightNumber: string;
  collectionFlightNumber: string;
  airportCode: string;
  hiddenPickup?: string;
  hiddenDropoff?: string;
};

export function planJourneyDirectionDependentReset(input: {
  previousIntent: QuoteJourneyDirectionIntent | null;
  nextIntent: QuoteJourneyDirectionIntent;
}): JourneyDirectionResetPlan {
  const { previousIntent: from, nextIntent: to } = input;
  const none: JourneyDirectionResetPlan = {
    clearPickup: false,
    clearDropoff: false,
    clearGoingFlight: false,
    clearCollectionFlight: false,
    clearAirportSelection: false,
    applyAirportTo: to === "from-airport" ? "pickup" : to === "to-airport" ? "dropoff" : null,
  };
  if (from == null || from === to) {
    return none;
  }

  if (to === "address-to-address") {
    return {
      clearPickup: from === "from-airport",
      clearDropoff: from === "to-airport",
      clearGoingFlight: true,
      clearCollectionFlight: true,
      clearAirportSelection: true,
      applyAirportTo: null,
    };
  }

  if (from === "from-airport" && to === "to-airport") {
    return {
      clearPickup: true,
      clearDropoff: true,
      clearGoingFlight: true,
      clearCollectionFlight: true,
      clearAirportSelection: false,
      applyAirportTo: "dropoff",
    };
  }

  if (from === "to-airport" && to === "from-airport") {
    return {
      clearPickup: true,
      clearDropoff: true,
      clearGoingFlight: true,
      clearCollectionFlight: true,
      clearAirportSelection: false,
      applyAirportTo: "pickup",
    };
  }

  if (from === "address-to-address" && to === "from-airport") {
    return {
      clearPickup: true,
      clearDropoff: false,
      clearGoingFlight: true,
      clearCollectionFlight: true,
      clearAirportSelection: false,
      applyAirportTo: "pickup",
    };
  }

  if (from === "address-to-address" && to === "to-airport") {
    return {
      clearPickup: false,
      clearDropoff: true,
      clearGoingFlight: true,
      clearCollectionFlight: true,
      clearAirportSelection: false,
      applyAirportTo: "dropoff",
    };
  }

  return none;
}

export function applyJourneyDirectionResetToSnapshot(
  snapshot: JourneyDirectionFormSnapshot,
  plan: JourneyDirectionResetPlan,
): JourneyDirectionFormSnapshot {
  return {
    pickupAddress: plan.clearPickup ? "" : snapshot.pickupAddress,
    dropoffAddress: plan.clearDropoff ? "" : snapshot.dropoffAddress,
    pickupIsAirport: plan.clearPickup ? false : snapshot.pickupIsAirport,
    dropoffIsAirport: plan.clearDropoff ? false : snapshot.dropoffIsAirport,
    goingFlightNumber: plan.clearGoingFlight ? "" : snapshot.goingFlightNumber,
    collectionFlightNumber: plan.clearCollectionFlight ? "" : snapshot.collectionFlightNumber,
    airportCode: plan.clearAirportSelection ? "" : snapshot.airportCode,
    hiddenPickup: plan.clearPickup ? "" : snapshot.hiddenPickup ?? "",
    hiddenDropoff: plan.clearDropoff ? "" : snapshot.hiddenDropoff ?? "",
  };
}

/** Fields that would be submitted after a direction change (no hidden leftovers). */
export function submittedJourneyLocationFields(snapshot: JourneyDirectionFormSnapshot): {
  pickupAddress: string;
  dropoffAddress: string;
  flightNumber: string;
  returnFlightNumber: string;
  airportCode: string;
  hiddenPickup: string;
  hiddenDropoff: string;
} {
  return {
    pickupAddress: snapshot.pickupAddress.trim(),
    dropoffAddress: snapshot.dropoffAddress.trim(),
    flightNumber: snapshot.goingFlightNumber.trim(),
    returnFlightNumber: snapshot.collectionFlightNumber.trim(),
    airportCode: snapshot.airportCode.trim(),
    hiddenPickup: String(snapshot.hiddenPickup || "").trim(),
    hiddenDropoff: String(snapshot.hiddenDropoff || "").trim(),
  };
}
