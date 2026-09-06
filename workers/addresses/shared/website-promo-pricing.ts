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
  outboundAirportAccessChargeGbp?: number;
  returnAirportAccessChargeGbp?: number;
  journeyFareAfterPromotionsGbp?: number;
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
    journeyFareBeforePromotionsGbp: num("journeyFareBeforePromotionsGbp"),
    originalEligibleJourneyPriceGbp: num("originalEligibleJourneyPriceGbp"),
    returnJourneySavingGbp: num("returnJourneySavingGbp"),
    returnOfferSavingGbp: num("returnOfferSavingGbp"),
    totalPromotionalSavingGbp: num("totalPromotionalSavingGbp"),
    airportAccessChargeGbp: num("airportAccessChargeGbp"),
    outboundAirportAccessChargeGbp: num("outboundAirportAccessChargeGbp"),
    returnAirportAccessChargeGbp: num("returnAirportAccessChargeGbp"),
    journeyFareAfterPromotionsGbp: num("journeyFareAfterPromotionsGbp"),
    finalAmountPayableGbp: num("finalAmountPayableGbp"),
  };
}

/** Customer-facing text lines for confirmation email / page (applied items only). */
export function formatCustomerPromoPricingLines(
  fields: WebsitePromoPricingFields,
  amountPaidLabel?: string,
): string[] {
  const lines: string[] = [];
  if (
    typeof fields.originalEligibleJourneyPriceGbp === "number" &&
    fields.originalEligibleJourneyPriceGbp > 0
  ) {
    lines.push(`Journey fare: ${formatGbpFare(fields.originalEligibleJourneyPriceGbp)}`);
  }
  if ((fields.returnJourneySavingGbp ?? 0) > 0) {
    lines.push(
      `Return journey saving: −${formatGbpFare(fields.returnJourneySavingGbp ?? 0)}`,
    );
  }
  if ((fields.returnOfferSavingGbp ?? 0) > 0) {
    lines.push(
      `Return journey saving 5%: −${formatGbpFare(fields.returnOfferSavingGbp ?? 0)}`,
    );
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
  if (
    typeof fields.originalEligibleJourneyPriceGbp === "number" &&
    fields.originalEligibleJourneyPriceGbp > 0
  ) {
    rows.push({
      label: "Journey fare",
      value: formatGbpFare(fields.originalEligibleJourneyPriceGbp),
    });
  }
  if ((fields.returnJourneySavingGbp ?? 0) > 0) {
    rows.push({
      label: "Return journey saving",
      value: `−${formatGbpFare(fields.returnJourneySavingGbp ?? 0)}`,
    });
  }
  if ((fields.returnOfferSavingGbp ?? 0) > 0) {
    rows.push({
      label: "Return journey saving 5%",
      value: `−${formatGbpFare(fields.returnOfferSavingGbp ?? 0)}`,
    });
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
