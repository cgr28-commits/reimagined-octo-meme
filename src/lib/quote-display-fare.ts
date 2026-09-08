/**
 * Choose which fare the quote card may display after a party/vehicle change.
 * Worker-authoritative splits are used only when they belong to the current
 * passengers + suitcases + automatic vehicle. Otherwise the client pricing
 * engine (liveQuote) must win immediately so Estate/Saloon never show each
 * other's price while a server refresh is in flight.
 */

export type ServerFarePartyParts = {
  journeyFareGbp: number;
  airportFixedCostsGbp: number;
  amountGbp: number;
  vehicleType: string;
  passengers: number;
  suitcases: number;
};

export function serverFareAppliesToParty(
  parts: ServerFarePartyParts | null | undefined,
  party: {
    passengers: number | null;
    suitcases: number | null;
    vehicleType: string;
  },
): boolean {
  if (!parts) return false;
  if (party.passengers == null || party.suitcases == null) return false;
  if (parts.passengers !== party.passengers) return false;
  if (parts.suitcases !== party.suitcases) return false;
  return parts.vehicleType === party.vehicleType;
}

export function resolveDisplayJourneyFareGbp(input: {
  liveJourneyFareGbp: number | null;
  liveAmountGbp: number | null;
  serverFareParts: ServerFarePartyParts | null | undefined;
  passengers: number | null;
  suitcases: number | null;
  vehicleType: string;
}): number | null {
  if (
    serverFareAppliesToParty(input.serverFareParts, {
      passengers: input.passengers,
      suitcases: input.suitcases,
      vehicleType: input.vehicleType,
    })
  ) {
    return input.serverFareParts!.journeyFareGbp;
  }
  if (input.liveJourneyFareGbp != null && Number.isFinite(input.liveJourneyFareGbp)) {
    return input.liveJourneyFareGbp;
  }
  if (input.liveAmountGbp != null && Number.isFinite(input.liveAmountGbp)) {
    return input.liveAmountGbp;
  }
  return null;
}
