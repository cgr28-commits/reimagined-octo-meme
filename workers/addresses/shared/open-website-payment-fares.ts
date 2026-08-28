/**
 * Open-website SumUp transfer fare resolution.
 *
 * Never trust client journeyFareGbp / airportFixedCostsGbp / amount alone.
 * Prefer the canonical website quote engine; always apply airport-fee rules
 * (including airport-specific removal permissions) server-side.
 */

import {
  resolveJourneyAirportFees,
  type JourneyAirportFeeResolution,
} from "./airport-fixed-costs";

export type OpenWebsitePaymentBookingLike = {
  pickupLabel?: string;
  dropoffLabel?: string;
  returnJourney?: boolean;
  tripDate?: string;
  tripTime?: string;
  returnDate?: string;
  returnTime?: string;
  passengers?: number;
  suitcases?: number;
  vehicle?: string;
  airportCode?: string | null;
  isFromAirport?: boolean;
  journeyKind?: string | null;
  pickupAirportCode?: string | null;
  dropoffAirportCode?: string | null;
  isAirportToAirport?: boolean;
  journeyDistance?: string;
  journeyDuration?: string;
};

export type OpenWebsitePaymentTransferInput = {
  /** Client-claimed transfer total (journey + fixed costs) before Express / promos. */
  clientTransferAmountGbp: number;
  claimedJourneyFareGbp?: number | null;
  claimedAirportFixedCostsGbp?: number | null;
  removedAirportFeeIds?: Iterable<string>;
  booking: OpenWebsitePaymentBookingLike;
  /**
   * Optional live route metrics from the browser (preferred over parsing labels).
   */
  routeMetrics?: { distanceKm: number; durationMinutes: number } | null;
  /**
   * Canonical requote result when the Worker could recalculate.
   * `journeyFareGbp` must already exclude airport fixed costs.
   */
  authoritativeQuote?: {
    amountGbp: number;
    journeyFareGbp: number;
    airportFixedCostsGbp: number;
  } | null;
};

export type OpenWebsitePaymentTransferResult =
  | {
      ok: true;
      journeyFareGbp: number;
      airportFixedCostsGbp: number;
      feeResolution: JourneyAirportFeeResolution;
      source: "canonical-quote" | "reconciled-client-transfer";
    }
  | {
      ok: false;
      error: string;
      feeResolution: JourneyAirportFeeResolution;
    };

function roundGbp(amount: number): number {
  return Math.round(Number(amount) * 100) / 100;
}

export function parseJourneyDistanceKmLabel(label?: string | null): number | null {
  const raw = String(label ?? "").trim();
  const match = /^([\d.]+)\s*miles$/i.exec(raw);
  if (!match) return null;
  const miles = Number(match[1]);
  if (!Number.isFinite(miles) || miles <= 0) return null;
  return miles / 0.621371;
}

export function parseJourneyDurationMinutesLabel(label?: string | null): number | null {
  const raw = String(label ?? "").trim().toLowerCase();
  if (!raw) return null;
  const hrMin = /^(\d+)\s*hr(?:\s+(\d+)\s*min)?$/.exec(raw);
  if (hrMin) {
    const hours = Number(hrMin[1]);
    const minutes = hrMin[2] ? Number(hrMin[2]) : 0;
    const total = hours * 60 + minutes;
    return total > 0 ? total : null;
  }
  const mins = /^(\d+)\s*min$/.exec(raw);
  if (mins) {
    const minutes = Number(mins[1]);
    return minutes > 0 ? minutes : null;
  }
  return null;
}

export function resolveRouteMetricsForPayment(input: {
  routeMetrics?: { distanceKm: number; durationMinutes: number } | null;
  journeyDistance?: string | null;
  journeyDuration?: string | null;
}): { distanceKm: number; durationMinutes: number } | null {
  const live = input.routeMetrics;
  if (
    live &&
    Number.isFinite(live.distanceKm) &&
    live.distanceKm > 0 &&
    Number.isFinite(live.durationMinutes) &&
    live.durationMinutes > 0
  ) {
    return {
      distanceKm: live.distanceKm,
      durationMinutes: live.durationMinutes,
    };
  }
  const distanceKm = parseJourneyDistanceKmLabel(input.journeyDistance);
  const durationMinutes = parseJourneyDurationMinutesLabel(input.journeyDuration);
  if (distanceKm == null || durationMinutes == null) return null;
  return { distanceKm, durationMinutes };
}

function bookingAirportContext(booking: OpenWebsitePaymentBookingLike): {
  isAirportToAirport: boolean;
  pickupAirportCode: string | null;
  dropoffAirportCode: string | null;
  airportCode: string | null;
  fromAirport: boolean;
} {
  const pickupCode =
    (typeof booking.pickupAirportCode === "string" && booking.pickupAirportCode.trim()) ||
    (booking.isFromAirport && typeof booking.airportCode === "string"
      ? booking.airportCode
      : null);
  const dropoffCode =
    (typeof booking.dropoffAirportCode === "string" && booking.dropoffAirportCode.trim()) ||
    (booking.isFromAirport === false && typeof booking.airportCode === "string"
      ? booking.airportCode
      : null);
  const isAirportToAirport = Boolean(
    booking.journeyKind === "airport-to-airport" ||
      booking.isAirportToAirport === true ||
      (pickupCode && dropoffCode),
  );
  return {
    isAirportToAirport: Boolean(isAirportToAirport && pickupCode && dropoffCode),
    pickupAirportCode: pickupCode,
    dropoffAirportCode: dropoffCode,
    airportCode: typeof booking.airportCode === "string" ? booking.airportCode : null,
    fromAirport: Boolean(booking.isFromAirport),
  };
}

/**
 * Resolve journey + airport fixed costs for open-website SumUp checkout.
 * Illegal DUB/LDY removals are ignored by resolveJourneyAirportFees.
 */
export function resolveOpenWebsitePaymentTransferFares(
  input: OpenWebsitePaymentTransferInput,
): OpenWebsitePaymentTransferResult {
  const ctx = bookingAirportContext(input.booking);
  const feeResolution = resolveJourneyAirportFees({
    isAirportToAirport: ctx.isAirportToAirport,
    pickupAirportCode: ctx.pickupAirportCode,
    dropoffAirportCode: ctx.dropoffAirportCode,
    airportCode: ctx.airportCode,
    fromAirport: ctx.fromAirport,
    returnJourney: Boolean(input.booking.returnJourney),
    removedFeeIds: input.removedAirportFeeIds,
  });
  const airportFixedCostsGbp = feeResolution.totalAppliedGbp;
  const clientTransfer = roundGbp(input.clientTransferAmountGbp);

  // Preferred: canonical engine journey fare + authoritative fee lines.
  const quote = input.authoritativeQuote;
  if (
    quote &&
    Number.isFinite(quote.journeyFareGbp) &&
    quote.journeyFareGbp >= 0 &&
    Number.isFinite(quote.amountGbp) &&
    quote.amountGbp >= 1
  ) {
    return {
      ok: true,
      journeyFareGbp: roundGbp(quote.journeyFareGbp),
      airportFixedCostsGbp,
      feeResolution,
      source: "canonical-quote",
    };
  }

  // Airport fixed costs present but no canonical requote: do not trust client journey.
  // (Prevents journey=£1 + fees=£4 with transfer=£5 underpaying the real fare.)
  if (feeResolution.totalOriginalGbp > 0) {
    return {
      ok: false,
      error: "Quote amount is out of date. Please refresh your quote and try again.",
      feeResolution,
    };
  }

  // Fallback for zero-fee journeys: restore reconciliation — journey must equal transfer.
  const claimedJourney = Number(input.claimedJourneyFareGbp);
  if (Number.isFinite(claimedJourney) && claimedJourney >= 0) {
    const expectedTransfer = roundGbp(claimedJourney + airportFixedCostsGbp);
    if (Math.abs(expectedTransfer - clientTransfer) <= 0.02) {
      return {
        ok: true,
        journeyFareGbp: roundGbp(claimedJourney),
        airportFixedCostsGbp,
        feeResolution,
        source: "reconciled-client-transfer",
      };
    }
    return {
      ok: false,
      error: "Quote amount is out of date. Please refresh your quote and try again.",
      feeResolution,
    };
  }

  if (clientTransfer >= 1) {
    return {
      ok: true,
      journeyFareGbp: roundGbp(clientTransfer),
      airportFixedCostsGbp,
      feeResolution,
      source: "reconciled-client-transfer",
    };
  }

  return {
    ok: false,
    error: "Quote amount is out of date. Please refresh your quote and try again.",
    feeResolution,
  };
}
