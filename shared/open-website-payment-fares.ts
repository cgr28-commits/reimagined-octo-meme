/**
 * Open-website SumUp transfer fare resolution.
 *
 * Never trust client journeyFareGbp / airportFixedCostsGbp / amount alone.
 * Prefer the canonical website quote engine; always apply airport-fee rules
 * (including airport-specific removal permissions) server-side.
 *
 * Route distance/duration for SumUp must be resolved on the Worker via
 * `resolveWorkerTripRouteMetrics` (see quote-handlers / payment handler).
 * Never treat body.routeMetrics or client journeyDistance/Duration labels as
 * authoritative payment inputs — those helpers below are for display/parsing only.
 *
 * Airport identity / direction for SumUp must be derived from pickup/drop-off
 * labels against SERVED_AIRPORTS (BFS/BHD/DUB/LDY). Never trust client
 * airportCode / isFromAirport / journeyKind / pickupAirportCode /
 * dropoffAirportCode / isAirportToAirport as payment authority.
 */

import {
  resolveJourneyAirportFees,
  type JourneyAirportFeeResolution,
} from "./airport-fixed-costs";
import {
  matchServedAirportCode,
  type ServedAirportCode,
} from "./served-airports";

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
  /** Client hint only — ignored for fee authority; labels win. */
  airportCode?: string | null;
  isFromAirport?: boolean;
  journeyKind?: string | null;
  pickupAirportCode?: string | null;
  dropoffAirportCode?: string | null;
  isAirportToAirport?: boolean;
  journeyDistance?: string;
  journeyDuration?: string;
};

/**
 * Server-derived airport identity for open-website SumUp.
 * Built only from pickup/drop-off text via SERVED_AIRPORTS matchers.
 */
export type PaymentAirportContext = {
  pickupAirportCode: ServedAirportCode | null;
  dropoffAirportCode: ServedAirportCode | null;
  isAirportToAirport: boolean;
  /** Single served airport when exactly one end is an airport. */
  airportCode: ServedAirportCode | null;
  /** true = pickup is the airport (airport → address). */
  fromAirport: boolean;
  isAirportTrip: boolean;
};

export type PaymentAirportContextResult =
  | { ok: true; context: PaymentAirportContext }
  | { ok: false; error: string };

/**
 * Derive airport identity and direction from booking addresses.
 * Does not read client airportCode / isFromAirport / journeyKind fields.
 */
export function resolvePaymentAirportContextFromAddresses(
  pickupLabel: string,
  dropoffLabel: string,
): PaymentAirportContextResult {
  const pickup = String(pickupLabel ?? "").trim();
  const dropoff = String(dropoffLabel ?? "").trim();
  if (!pickup || !dropoff) {
    return {
      ok: false,
      error: "Quote amount is out of date. Please refresh your quote and try again.",
    };
  }

  const pickupAirportCode = matchServedAirportCode(pickup);
  const dropoffAirportCode = matchServedAirportCode(dropoff);

  if (pickupAirportCode && dropoffAirportCode && pickupAirportCode === dropoffAirportCode) {
    // Same airport both ends — not a confident transfer context.
    return {
      ok: false,
      error: "Quote amount is out of date. Please refresh your quote and try again.",
    };
  }

  const isAirportToAirport = Boolean(
    pickupAirportCode && dropoffAirportCode && pickupAirportCode !== dropoffAirportCode,
  );

  if (isAirportToAirport) {
    return {
      ok: true,
      context: {
        pickupAirportCode,
        dropoffAirportCode,
        isAirportToAirport: true,
        airportCode: null,
        fromAirport: true,
        isAirportTrip: true,
      },
    };
  }

  if (pickupAirportCode && !dropoffAirportCode) {
    return {
      ok: true,
      context: {
        pickupAirportCode,
        dropoffAirportCode: null,
        isAirportToAirport: false,
        airportCode: pickupAirportCode,
        fromAirport: true,
        isAirportTrip: true,
      },
    };
  }

  if (dropoffAirportCode && !pickupAirportCode) {
    return {
      ok: true,
      context: {
        pickupAirportCode: null,
        dropoffAirportCode,
        isAirportToAirport: false,
        airportCode: dropoffAirportCode,
        fromAirport: false,
        isAirportTrip: true,
      },
    };
  }

  // Address ↔ address (or unrecognised ends): confident non-airport-fee journey.
  return {
    ok: true,
    context: {
      pickupAirportCode: null,
      dropoffAirportCode: null,
      isAirportToAirport: false,
      airportCode: null,
      fromAirport: false,
      isAirportTrip: false,
    },
  };
}

export type OpenWebsitePaymentTransferInput = {
  /** Client-claimed transfer total (journey + fixed costs) before Express / promos. */
  clientTransferAmountGbp: number;
  claimedJourneyFareGbp?: number | null;
  claimedAirportFixedCostsGbp?: number | null;
  removedAirportFeeIds?: Iterable<string>;
  booking: OpenWebsitePaymentBookingLike;
  /**
   * Server-resolved route metrics only (from resolveWorkerTripRouteMetrics).
   * Informational / audit — fare authority is `authoritativeQuote`.
   * Never pass browser body.routeMetrics here for payment.
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
  /**
   * Server-derived airport context (from addresses). Required for fee authority.
   * When omitted, derived from booking pickup/drop-off labels.
   */
  airportContext?: PaymentAirportContext | null;
};

export type OpenWebsitePaymentTransferResult =
  | {
      ok: true;
      journeyFareGbp: number;
      airportFixedCostsGbp: number;
      feeResolution: JourneyAirportFeeResolution;
      airportContext: PaymentAirportContext;
      source: "canonical-quote" | "reconciled-client-transfer";
    }
  | {
      ok: false;
      error: string;
      feeResolution: JourneyAirportFeeResolution;
      airportContext: PaymentAirportContext | null;
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

/**
 * Parse display labels into metrics. For UI / diagnostics only —
 * do NOT use as SumUp payment authority (use resolveWorkerTripRouteMetrics).
 */
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

function paymentAirportContextForBooking(
  booking: OpenWebsitePaymentBookingLike,
  explicit?: PaymentAirportContext | null,
): PaymentAirportContextResult {
  if (explicit) {
    return { ok: true, context: explicit };
  }
  return resolvePaymentAirportContextFromAddresses(
    String(booking.pickupLabel ?? ""),
    String(booking.dropoffLabel ?? ""),
  );
}

/**
 * Resolve journey + airport fixed costs for open-website SumUp checkout.
 * Illegal DUB/LDY removals are ignored by resolveJourneyAirportFees.
 * Airport identity comes from address labels (SERVED_AIRPORTS), not client fields.
 */
export function resolveOpenWebsitePaymentTransferFares(
  input: OpenWebsitePaymentTransferInput,
): OpenWebsitePaymentTransferResult {
  const ctxResult = paymentAirportContextForBooking(input.booking, input.airportContext);
  if (!ctxResult.ok) {
    return {
      ok: false,
      error: ctxResult.error,
      feeResolution: {
        isAirportToAirport: false,
        lines: [],
        totalOriginalGbp: 0,
        totalAppliedGbp: 0,
      },
      airportContext: null,
    };
  }
  const ctx = ctxResult.context;
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
      airportContext: ctx,
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
      airportContext: ctx,
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
        airportContext: ctx,
        source: "reconciled-client-transfer",
      };
    }
    return {
      ok: false,
      error: "Quote amount is out of date. Please refresh your quote and try again.",
      feeResolution,
      airportContext: ctx,
    };
  }

  if (clientTransfer >= 1) {
    return {
      ok: true,
      journeyFareGbp: roundGbp(clientTransfer),
      airportFixedCostsGbp,
      feeResolution,
      airportContext: ctx,
      source: "reconciled-client-transfer",
    };
  }

  return {
    ok: false,
    error: "Quote amount is out of date. Please refresh your quote and try again.",
    feeResolution,
    airportContext: ctx,
  };
}
