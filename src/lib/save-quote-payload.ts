/**
 * Pure helpers for the live QuoteCard → Save Quote request payload.
 * Keeps client mapping testable without mounting React.
 */

import {
  formatSavedQuoteAmount,
  type SavedQuoteJourneySnapshot,
  type SavedQuotePricingSnapshot,
} from "../../shared/saved-quote";

export type SaveQuoteLivePricingMeta = {
  area: string | null;
  areaSurcharge: number;
  airportBase: number;
  vehicleMultiplier: number;
  vehicleAdjustment: number;
  premiumApplied: boolean;
  operational?: Record<string, unknown> | null;
};

export type SaveQuoteLiveQuoteSnapshot = {
  amount: number;
  area: string | null;
  areaSurcharge: number;
  airportBase: number;
  vehicleMultiplier: number;
  vehicleAdjustment: number;
  premiumApplied: boolean;
  operational?: Record<string, unknown> | null;
};

export type BuildSaveQuotePayloadInput = {
  liveQuote: SaveQuoteLiveQuoteSnapshot | null;
  canPayNowOnline: boolean;
  isEnquiryOnly: boolean;
  showsRequestQuoteFlow: boolean;
  pickupLabel: string;
  dropoffLabel: string;
  pickupPlaceId?: string;
  dropoffPlaceId?: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  airportCode?: string;
  tripDirection: "from-airport" | "to-airport";
  isAirportTrip: boolean;
  isFromAirport?: boolean;
  journeyType: string;
  tripDate: string;
  tripTime: string;
  returnJourney: boolean;
  returnDate?: string;
  returnTime?: string;
  passengers: number;
  suitcases: number;
  childSeats?: number;
  childSeatNotes?: string;
  vehicle: string;
  flightNumber?: string;
  returnFlightNumber?: string;
  tripLabel: string;
  journeyDistance?: string;
  journeyDuration?: string;
};

export type SaveQuoteRequestBody = {
  customerName: string;
  customerEmail: string;
  journey: SavedQuoteJourneySnapshot;
  pricing: SavedQuotePricingSnapshot;
};

export type BuildSaveQuotePayloadResult =
  | { ok: true; payload: SaveQuoteRequestBody }
  | {
      ok: false;
      reason:
        | "missing_live_quote"
        | "not_online_payable"
        | "enquiry_or_request_flow"
        | "missing_route"
        | "missing_schedule";
      message: string;
    };

/** Customer-facing copy — never imply the quote "expired" unless it really did. */
export function saveQuotePayloadBlockMessage(
  reason: Exclude<BuildSaveQuotePayloadResult, { ok: true }>["reason"],
): string {
  switch (reason) {
    case "missing_schedule":
      return "Please select your pickup date and time before saving this quote.";
    case "missing_route":
      return "Please complete your pickup and destination before saving this quote.";
    case "missing_live_quote":
      return "We couldn’t find a live price for this journey. Please recalculate your quote and try again.";
    case "not_online_payable":
    case "enquiry_or_request_flow":
      return "This journey needs a personal quote, so it can’t be saved for online booking yet. Please continue with Request Quote instead.";
    default:
      return "We couldn’t prepare this quote for saving. Please check your journey details and try again.";
  }
}

/**
 * Map a live QuoteCard fare + journey fields into the POST /saved-quotes body
 * (name/email filled by the modal afterwards).
 */
export function buildSaveQuotePayloadFromLiveQuote(
  input: BuildSaveQuotePayloadInput,
): BuildSaveQuotePayloadResult {
  if (!input.liveQuote) {
    return {
      ok: false,
      reason: "missing_live_quote",
      message: saveQuotePayloadBlockMessage("missing_live_quote"),
    };
  }
  if (!input.canPayNowOnline) {
    return {
      ok: false,
      reason: "not_online_payable",
      message: saveQuotePayloadBlockMessage("not_online_payable"),
    };
  }
  if (input.isEnquiryOnly || input.showsRequestQuoteFlow) {
    return {
      ok: false,
      reason: "enquiry_or_request_flow",
      message: saveQuotePayloadBlockMessage("enquiry_or_request_flow"),
    };
  }

  const pickupLabel = input.pickupLabel.trim();
  const dropoffLabel = input.dropoffLabel.trim();
  if (!pickupLabel || !dropoffLabel) {
    return {
      ok: false,
      reason: "missing_route",
      message: saveQuotePayloadBlockMessage("missing_route"),
    };
  }

  const tripDate = input.tripDate.trim();
  const tripTime = input.tripTime.trim();
  if (!tripDate || !tripTime) {
    return {
      ok: false,
      reason: "missing_schedule",
      message: saveQuotePayloadBlockMessage("missing_schedule"),
    };
  }

  const journey: SavedQuoteJourneySnapshot = {
    pickupLabel,
    dropoffLabel,
    pickupPlaceId: input.pickupPlaceId || undefined,
    dropoffPlaceId: input.dropoffPlaceId || undefined,
    pickupLat: input.pickupLat,
    pickupLng: input.pickupLng,
    dropoffLat: input.dropoffLat,
    dropoffLng: input.dropoffLng,
    airportCode: input.airportCode || undefined,
    tripDirection: input.tripDirection,
    isAirportTrip: Boolean(input.isAirportTrip),
    isFromAirport: input.isFromAirport,
    journeyType: input.journeyType,
    tripDate,
    tripTime,
    returnJourney: Boolean(input.returnJourney),
    returnDate: input.returnJourney ? input.returnDate : undefined,
    returnTime: input.returnJourney ? input.returnTime : undefined,
    passengers: input.passengers,
    suitcases: input.suitcases,
    childSeats: input.childSeats,
    childSeatNotes: input.childSeatNotes,
    vehicle: input.vehicle,
    flightNumber: input.flightNumber || undefined,
    returnFlightNumber: input.returnFlightNumber || undefined,
    tripLabel: input.tripLabel,
    journeyDistance: input.journeyDistance,
    journeyDuration: input.journeyDuration,
  };

  const pricing: SavedQuotePricingSnapshot = {
    totalAmount: input.liveQuote.amount,
    currency: "GBP",
    amountLabel: formatSavedQuoteAmount(input.liveQuote.amount),
    pricingMeta: {
      area: input.liveQuote.area,
      areaSurcharge: input.liveQuote.areaSurcharge,
      airportBase: input.liveQuote.airportBase,
      vehicleMultiplier: input.liveQuote.vehicleMultiplier,
      vehicleAdjustment: input.liveQuote.vehicleAdjustment,
      premiumApplied: input.liveQuote.premiumApplied,
      operational: input.liveQuote.operational,
    },
  };

  return {
    ok: true,
    payload: {
      customerName: "",
      customerEmail: "",
      journey,
      pricing,
    },
  };
}
