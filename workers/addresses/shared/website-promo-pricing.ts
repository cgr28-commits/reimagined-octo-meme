/**
 * Snapshot of promotional / access pricing persisted on paid bookings
 * so confirmation + email can show only discounts that actually applied.
 */

import type { WebsiteFareBreakdown } from "./website-fare-breakdown";
import { formatGbpFare } from "./website-fare-breakdown";

export type WebsitePromoPricingFields = {
  /** Journey fare after return discount, before Express. */
  journeyFareBeforePromotionsGbp?: number;
  /** Undiscounted return (2× one-way) when return journey; else same as journey before promos. */
  originalEligibleJourneyPriceGbp?: number;
  returnJourneySavingGbp?: number;
  returnOfferSavingGbp?: number;
  totalPromotionalSavingGbp?: number;
  /** Express fee charged (0 when free option selected). */
  airportAccessChargeGbp?: number;
  meetGreetFeeGbp?: number;
  outboundAirportAccessChargeGbp?: number;
  returnAirportAccessChargeGbp?: number;
  journeyFareAfterPromotionsGbp?: number;
  nightWeekendSurchargeGbp?: number;
  /** Airport barrier / parking costs built into the transfer fare (e.g. Dublin £13 on a return). */
  airportFixedCostsGbp?: number;
  finalAmountPayableGbp?: number;
};

export function promoFieldsFromFareBreakdown(
  breakdown: WebsiteFareBreakdown,
): WebsitePromoPricingFields {
  return {
    journeyFareBeforePromotionsGbp: breakdown.journeyFareBeforePromotionsGbp,
    originalEligibleJourneyPriceGbp: breakdown.originalEligibleJourneyPriceGbp,
    returnJourneySavingGbp: breakdown.returnJourneySavingGbp,
    returnOfferSavingGbp: breakdown.returnOfferSavingGbp,
    totalPromotionalSavingGbp: breakdown.totalPromotionalSavingGbp,
    airportAccessChargeGbp: breakdown.airportAccessChargeGbp,
    outboundAirportAccessChargeGbp: breakdown.outboundAirportAccessChargeGbp,
    returnAirportAccessChargeGbp: breakdown.returnAirportAccessChargeGbp,
    journeyFareAfterPromotionsGbp: breakdown.journeyFareAfterPromotionsGbp,
    nightWeekendSurchargeGbp: breakdown.nightWeekendSurchargeGbp,
    finalAmountPayableGbp: breakdown.finalAmountPayableGbp,
  };
}

export function parseWebsitePromoPricingFields(
  input: Record<string, unknown> | null | undefined,
): WebsitePromoPricingFields {
  if (!input || typeof input !== "object") return {};
  const num = (key: string): number | undefined => {
    const raw = Number(input[key]);
    if (!Number.isFinite(raw) || raw < 0) return undefined;
    return Math.round(raw * 100) / 100;
  };
  return {
    meetGreetFeeGbp: input.meetGreetFeeGbp == null ? undefined : num("meetGreetFeeGbp"),
    journeyFareBeforePromotionsGbp: num("journeyFareBeforePromotionsGbp"),
    originalEligibleJourneyPriceGbp: num("originalEligibleJourneyPriceGbp"),
    returnJourneySavingGbp: num("returnJourneySavingGbp"),
    returnOfferSavingGbp: num("returnOfferSavingGbp"),
    totalPromotionalSavingGbp: num("totalPromotionalSavingGbp"),
    airportAccessChargeGbp: num("airportAccessChargeGbp"),
    outboundAirportAccessChargeGbp: num("outboundAirportAccessChargeGbp"),
    returnAirportAccessChargeGbp: num("returnAirportAccessChargeGbp"),
    journeyFareAfterPromotionsGbp: num("journeyFareAfterPromotionsGbp"),
    nightWeekendSurchargeGbp: num("nightWeekendSurchargeGbp"),
    airportFixedCostsGbp: num("airportFixedCostsGbp"),
    finalAmountPayableGbp: num("finalAmountPayableGbp"),
  };
}

/**
 * Display-only: the journey fare row, plus the airport charges row, adjusted so the rows a
 * customer sees add up to the amount charged. The amount payable rounds to whole pounds
 * (e.g. £502.30 → £502), so that rounding is folded into the journey fare row, as on the
 * quote page. Larger gaps are left alone (never hide a real difference).
 */
function displayJourneyRows(fields: WebsitePromoPricingFields): {
  journeyGbp: number | undefined;
  airportFixedGbp: number;
} {
  const journey =
    typeof fields.originalEligibleJourneyPriceGbp === "number" &&
    fields.originalEligibleJourneyPriceGbp > 0
      ? fields.originalEligibleJourneyPriceGbp
      : undefined;
  const fixed = (fields.airportFixedCostsGbp ?? 0) > 0 ? (fields.airportFixedCostsGbp ?? 0) : 0;
  if (journey == null || typeof fields.finalAmountPayableGbp !== "number") {
    return { journeyGbp: journey, airportFixedGbp: fixed };
  }
  const access =
    (fields.outboundAirportAccessChargeGbp ?? 0) > 0 || (fields.returnAirportAccessChargeGbp ?? 0) > 0
      ? (fields.outboundAirportAccessChargeGbp ?? 0) + (fields.returnAirportAccessChargeGbp ?? 0)
      : (fields.airportAccessChargeGbp ?? 0);
  const shown =
    journey -
    (fields.returnJourneySavingGbp ?? 0) -
    (fields.returnOfferSavingGbp ?? 0) +
    (fields.nightWeekendSurchargeGbp ?? 0) +
    fixed +
    access;
  const gap = Math.round((fields.finalAmountPayableGbp - shown) * 100) / 100;
  if (gap !== 0 && Math.abs(gap) < 1) {
    return { journeyGbp: Math.round((journey + gap) * 100) / 100, airportFixedGbp: fixed };
  }
  return { journeyGbp: journey, airportFixedGbp: fixed };
}

/** Customer-facing text lines for confirmation email / page (applied items only). */
export function formatCustomerPromoPricingLines(
  fields: WebsitePromoPricingFields,
  amountPaidLabel?: string,
): string[] {
  const lines: string[] = [];
  if (fields.meetGreetFeeGbp != null) lines.push(`Meet & Greet: ${formatGbpFare(fields.meetGreetFeeGbp)}`);
  const display = displayJourneyRows(fields);
  if (display.journeyGbp != null) {
    lines.push(`Journey fare: ${formatGbpFare(display.journeyGbp)}`);
  }
  if ((fields.returnJourneySavingGbp ?? 0) > 0) {
    lines.push(
      `5% Return Booking Discount: −${formatGbpFare(fields.returnJourneySavingGbp ?? 0)}`,
    );
  }
  if ((fields.returnOfferSavingGbp ?? 0) > 0) {
    lines.push(
      `Return journey saving 5%: −${formatGbpFare(fields.returnOfferSavingGbp ?? 0)}`,
    );
  }
  if ((fields.nightWeekendSurchargeGbp ?? 0) > 0) {
    lines.push(
      `Evening / Night / Weekend surcharge: ${formatGbpFare(fields.nightWeekendSurchargeGbp ?? 0)}`,
    );
  }
  if (display.airportFixedGbp > 0) {
    lines.push(`Airport / barrier charges: ${formatGbpFare(display.airportFixedGbp)}`);
  }
  if (
    (fields.outboundAirportAccessChargeGbp ?? 0) > 0 ||
    (fields.returnAirportAccessChargeGbp ?? 0) > 0
  ) {
    if ((fields.outboundAirportAccessChargeGbp ?? 0) > 0) {
      lines.push(
        `Outbound airport charge: ${formatGbpFare(fields.outboundAirportAccessChargeGbp ?? 0)}`,
      );
    }
    if ((fields.returnAirportAccessChargeGbp ?? 0) > 0) {
      lines.push(
        `Return airport charge: ${formatGbpFare(fields.returnAirportAccessChargeGbp ?? 0)}`,
      );
    }
  } else if ((fields.airportAccessChargeGbp ?? 0) > 0) {
    lines.push(
      `Airport access charge: ${formatGbpFare(fields.airportAccessChargeGbp ?? 0)}`,
    );
  }
  if ((fields.totalPromotionalSavingGbp ?? 0) > 0) {
    lines.push(
      `Total saved: ${formatGbpFare(fields.totalPromotionalSavingGbp ?? 0)}`,
    );
  }
  if (amountPaidLabel?.trim()) {
    lines.push(`Amount paid: ${amountPaidLabel.trim()}`);
  } else if (typeof fields.finalAmountPayableGbp === "number") {
    lines.push(`Amount paid: ${formatGbpFare(fields.finalAmountPayableGbp)}`);
  }
  return lines;
}

export function formatCustomerPromoPricingHtmlRows(
  fields: WebsitePromoPricingFields,
  amountPaidLabel?: string,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (fields.meetGreetFeeGbp != null) rows.push({ label: "Meet & Greet", value: formatGbpFare(fields.meetGreetFeeGbp) });
  const display = displayJourneyRows(fields);
  if (display.journeyGbp != null) {
    rows.push({
      label: "Journey fare",
      value: formatGbpFare(display.journeyGbp),
    });
  }
  if ((fields.returnJourneySavingGbp ?? 0) > 0) {
    rows.push({
      label: "5% Return Booking Discount",
      value: `−${formatGbpFare(fields.returnJourneySavingGbp ?? 0)}`,
    });
  }
  if ((fields.returnOfferSavingGbp ?? 0) > 0) {
    rows.push({
      label: "Return journey saving 5%",
      value: `−${formatGbpFare(fields.returnOfferSavingGbp ?? 0)}`,
    });
  }
  if ((fields.nightWeekendSurchargeGbp ?? 0) > 0) {
    rows.push({
      label: "Evening / Night / Weekend surcharge",
      value: formatGbpFare(fields.nightWeekendSurchargeGbp ?? 0),
    });
  }
  if (display.airportFixedGbp > 0) {
    rows.push({ label: "Airport / barrier charges", value: formatGbpFare(display.airportFixedGbp) });
  }
  if (
    (fields.outboundAirportAccessChargeGbp ?? 0) > 0 ||
    (fields.returnAirportAccessChargeGbp ?? 0) > 0
  ) {
    if ((fields.outboundAirportAccessChargeGbp ?? 0) > 0) {
      rows.push({
        label: "Outbound airport charge",
        value: formatGbpFare(fields.outboundAirportAccessChargeGbp ?? 0),
      });
    }
    if ((fields.returnAirportAccessChargeGbp ?? 0) > 0) {
      rows.push({
        label: "Return airport charge",
        value: formatGbpFare(fields.returnAirportAccessChargeGbp ?? 0),
      });
    }
  } else if ((fields.airportAccessChargeGbp ?? 0) > 0) {
    rows.push({
      label: "Airport access charge",
      value: formatGbpFare(fields.airportAccessChargeGbp ?? 0),
    });
  }
  if ((fields.totalPromotionalSavingGbp ?? 0) > 0) {
    rows.push({
      label: "Total saved",
      value: formatGbpFare(fields.totalPromotionalSavingGbp ?? 0),
    });
  }
  if (amountPaidLabel?.trim()) {
    rows.push({ label: "Amount paid", value: amountPaidLabel.trim() });
  } else if (typeof fields.finalAmountPayableGbp === "number") {
    rows.push({
      label: "Amount paid",
      value: formatGbpFare(fields.finalAmountPayableGbp),
    });
  }
  return rows;
}
