/**
 * Choose which fare the quote card may display after a party/vehicle/schedule change.
 * Worker-authoritative splits are used only when they belong to the current
 * passengers + suitcases + automatic vehicle + booked pickup schedule. Otherwise
 * the client pricing engine (liveQuote) must win immediately so a weekday fare
 * never paints on a Saturday pickup (or Saloon on Estate) while refresh is in flight.
 */

export type ServerFareScheduleParts = {
  outboundDate?: string;
  outboundTime?: string;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
};

export type ServerFarePartyParts = {
  journeyFareGbp: number;
  airportFixedCostsGbp: number;
  nightWeekendSurchargeGbp?: number;
  outboundOneWayBeforeAccessGbp?: number;
  returnOneWayBeforeAccessGbp?: number;
  amountGbp: number;
  vehicleType: string;
  passengers: number;
  suitcases: number;
  /**
   * Uplift already inside amountGbp. Null when protection did not run.
   * Display only — never added on top of the customer total.
   */
  profitabilityAdjustmentGbp?: number | null;
  /** Owner pricing configuration version that produced this fare. */
  pricingVersion?: number;
  /** Opaque Worker signature. Absent while profitability protection is off. */
  quoteReceipt?: string;
} & ServerFareScheduleParts;

function sameScheduleField(left?: string | null, right?: string | null): boolean {
  return String(left ?? "").trim() === String(right ?? "").trim();
}

export function serverFareAppliesToParty(
  parts: ServerFarePartyParts | null | undefined,
  party: {
    passengers: number | null;
    suitcases: number | null;
    vehicleType: string;
    outboundDate?: string | null;
    outboundTime?: string | null;
    returnJourney?: boolean;
    returnDate?: string | null;
    returnTime?: string | null;
  },
): boolean {
  if (!parts) return false;
  if (party.passengers == null || party.suitcases == null) return false;
  if (parts.passengers !== party.passengers) return false;
  if (parts.suitcases !== party.suitcases) return false;
  if (parts.vehicleType !== party.vehicleType) return false;
  if (
    party.outboundDate != null ||
    party.outboundTime != null ||
    party.returnJourney != null ||
    party.returnDate != null ||
    party.returnTime != null
  ) {
    if (!sameScheduleField(parts.outboundDate, party.outboundDate)) return false;
    if (!sameScheduleField(parts.outboundTime, party.outboundTime)) return false;
    if (Boolean(parts.returnJourney) !== Boolean(party.returnJourney)) return false;
    if (party.returnJourney) {
      if (!sameScheduleField(parts.returnDate, party.returnDate)) return false;
      if (!sameScheduleField(parts.returnTime, party.returnTime)) return false;
    }
  }
  return true;
}

export function resolveDisplayJourneyFareGbp(input: {
  liveJourneyFareGbp: number | null;
  liveAmountGbp: number | null;
  serverFareParts: ServerFarePartyParts | null | undefined;
  passengers: number | null;
  suitcases: number | null;
  vehicleType: string;
  outboundDate?: string | null;
  outboundTime?: string | null;
  returnJourney?: boolean;
  returnDate?: string | null;
  returnTime?: string | null;
}): number | null {
  if (
    serverFareAppliesToParty(input.serverFareParts, {
      passengers: input.passengers,
      suitcases: input.suitcases,
      vehicleType: input.vehicleType,
      outboundDate: input.outboundDate,
      outboundTime: input.outboundTime,
      returnJourney: input.returnJourney,
      returnDate: input.returnDate,
      returnTime: input.returnTime,
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
