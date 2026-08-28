/**
 * Central journey inclusion copy — airport pickup vs drop-off, waiting time, tolls.
 * Do not scatter contradictory fee wording across UI components.
 *
 * Airport fixed costs (fees / parking / M1 toll allowances) are applied in the
 * quote calculator via `shared/airport-fixed-costs.ts`. This module only controls
 * customer-facing wording and must stay direction- and airport-specific.
 */

import {
  getAirportLegFixedCosts,
  type AirportFixedCostCode,
} from "./airport-fixed-costs";

export type AirportCodeLike = "BFS" | "BHD" | "DUB" | "LDY" | string;

export type JourneyInclusionContext = {
  /** Pickup location is an airport (Airport → Address leg). */
  pickupIsAirport: boolean;
  /** Destination is an airport (Address → Airport leg). */
  dropoffIsAirport: boolean;
  /** Airport code when either end is an airport. */
  airportCode?: AirportCodeLike | null;
  /**
   * Return booked together: outbound uses pickup/dropoff flags above;
   * return leg is the reverse (airport ↔ address).
   */
  returnJourney?: boolean;
};

export type JourneyInclusions = {
  /** One-line summary under the price. */
  summary: string;
  /** Short quote-summary bullets (with ✓ prefix). */
  bullets: string[];
  /** Plain lines for emails (no ✓). */
  emailIncludeLines: string[];
  /** Outbound-only bullets when returnJourney (with ✓). */
  outboundBullets: string[];
  /** Return-leg bullets when returnJourney (with ✓). */
  returnBullets: string[];
  /** Complimentary waiting at the collection point for this booking context. */
  complimentaryWaitingMinutes: 10 | 60;
  /** Whether applicable tolls are mentioned (Dublin Airport product only today). */
  mentionsTolls: boolean;
};

const GENERAL_FEES_AND_TOLLS = "Airport fees and applicable tolls included.";
const DROPOFF_FEE = "Airport drop-off fee included.";
const PICKUP_FEE = "Airport pickup fee included";
const WAITING_60 = "60 minutes complimentary airport waiting.";
const DUB_TOLLS = "M1 tolls included.";
const DUB_PARKING_AND_TOLLS = "Dublin Airport pickup/parking (£5) and M1 tolls included.";
const DUB_PICKUP_PARKING = "Dublin Airport pickup/parking (£5) included.";
const LDY_PICKUP_FEE = "City of Derry Airport pickup (£2.50) included.";
const LDY_DROPOFF_FEE = "City of Derry Airport drop-off (£1) included.";

function isDublinAirport(code?: AirportCodeLike | null): boolean {
  return (code ?? "").trim().toUpperCase() === "DUB";
}

function asFixedCostCode(code?: AirportCodeLike | null): AirportFixedCostCode | null {
  const normalised = (code ?? "").trim().toUpperCase();
  if (normalised === "BFS" || normalised === "BHD" || normalised === "DUB" || normalised === "LDY") {
    return normalised;
  }
  return null;
}

/** Tolls are only mentioned for Dublin Airport legs that include an M1 allowance. */
export function journeyIncludesApplicableTolls(
  airportCode?: AirportCodeLike | null,
  options?: { pickupIsAirport?: boolean; dropoffIsAirport?: boolean },
): boolean {
  if (!isDublinAirport(airportCode)) {
    return false;
  }
  if (!options?.pickupIsAirport && !options?.dropoffIsAirport) {
    return false;
  }
  const fromAirport = Boolean(options?.pickupIsAirport);
  const costs = getAirportLegFixedCosts(airportCode, fromAirport);
  return Boolean(costs && costs.tollAllowanceGbp > 0);
}

/**
 * Direction-specific inclusion bullets for one airport leg.
 * Only lists a fee/parking/toll line when a genuine fixed cost was added.
 */
function bulletsForAirportLeg(options: {
  fromAirport: boolean;
  airportCode?: AirportCodeLike | null;
}): string[] {
  const { fromAirport, airportCode } = options;
  const costs = getAirportLegFixedCosts(airportCode, fromAirport);
  const items: string[] = [];
  const code = asFixedCostCode(airportCode);

  if (code === "DUB") {
    if (fromAirport) {
      if (costs?.hasCharge) {
        items.push(
          costs.tollAllowanceGbp > 0 ? DUB_PARKING_AND_TOLLS : DUB_PICKUP_PARKING,
        );
      }
      items.push(WAITING_60);
    } else if (costs && costs.tollAllowanceGbp > 0) {
      items.push(DUB_TOLLS);
    }
    return items;
  }

  if (code === "LDY") {
    if (fromAirport) {
      if (costs && costs.totalGbp > 0) {
        items.push(LDY_PICKUP_FEE);
      }
      items.push(WAITING_60);
    } else if (costs && costs.totalGbp > 0) {
      items.push(LDY_DROPOFF_FEE);
    }
    return items;
  }

  // BFS / BHD (and any future fee-bearing NI airport with the same pattern)
  if (fromAirport) {
    if (costs && costs.pickupFeeGbp > 0) {
      items.push(PICKUP_FEE);
    }
    items.push(WAITING_60);
  } else if (costs && costs.dropOffFeeGbp > 0) {
    items.push(DROPOFF_FEE);
  }

  return items;
}

function summaryForAirportLeg(options: {
  fromAirport: boolean;
  airportCode?: AirportCodeLike | null;
}): string {
  const costs = getAirportLegFixedCosts(options.airportCode, options.fromAirport);
  const code = asFixedCostCode(options.airportCode);

  if (code === "LDY") {
    if (options.fromAirport) {
      return costs?.hasCharge
        ? "Fixed price including City of Derry Airport pickup and 60 minutes complimentary waiting."
        : "Fixed price including 60 minutes complimentary airport waiting.";
    }
    return costs?.hasCharge
      ? "Fixed price including City of Derry Airport drop-off."
      : "Fixed price for your journey.";
  }

  if (code === "DUB") {
    if (options.fromAirport) {
      return costs?.parkingAllowanceGbp && costs.parkingAllowanceGbp > 0
        ? costs.tollAllowanceGbp > 0
          ? "Fixed price including Dublin Airport pickup/parking, M1 tolls, and waiting time."
          : "Fixed price including Dublin Airport pickup/parking and waiting time."
        : costs?.tollAllowanceGbp && costs.tollAllowanceGbp > 0
          ? "Fixed price including M1 tolls and waiting time."
          : "Fixed price including 60 minutes complimentary airport waiting.";
    }
    return costs?.tollAllowanceGbp && costs.tollAllowanceGbp > 0
      ? "Fixed price including M1 tolls."
      : "Fixed price for your journey.";
  }

  if (costs?.hasCharge) {
    return GENERAL_FEES_AND_TOLLS;
  }

  return "Fixed price for your journey.";
}

function withChecks(lines: string[]): string[] {
  return lines.map((line) => (line.startsWith("✓") ? line : `✓ ${line}`));
}

function withoutChecks(lines: string[]): string[] {
  return lines.map((line) => line.replace(/^✓\s*/, ""));
}

/**
 * Build inclusion messages for a one-way or return transfer.
 * Never lists both pickup and drop-off fees on the same one-way airport leg.
 */
export function getJourneyInclusions(context: JourneyInclusionContext): JourneyInclusions {
  const pickupIsAirport = Boolean(context.pickupIsAirport);
  const dropoffIsAirport = Boolean(context.dropoffIsAirport);
  const returnJourney = Boolean(context.returnJourney);
  const airportCode = context.airportCode ?? null;

  // Address ↔ address (no airport ends)
  if (!pickupIsAirport && !dropoffIsAirport) {
    const waitingBullet = withChecks(["10 minutes complimentary waiting time"]);
    return {
      summary: "Fixed price for your journey.",
      bullets: waitingBullet,
      emailIncludeLines: withoutChecks(waitingBullet),
      outboundBullets: waitingBullet,
      returnBullets: [],
      complimentaryWaitingMinutes: 10,
      mentionsTolls: false,
    };
  }

  // Prefer a single airport end. If both somehow set, treat as pickup-from-airport.
  const outboundFromAirport = pickupIsAirport;

  if (!returnJourney) {
    const bullets = withChecks(
      bulletsForAirportLeg({ fromAirport: outboundFromAirport, airportCode }),
    );
    return {
      summary: summaryForAirportLeg({ fromAirport: outboundFromAirport, airportCode }),
      bullets,
      emailIncludeLines: withoutChecks(bullets),
      outboundBullets: bullets,
      returnBullets: [],
      complimentaryWaitingMinutes: outboundFromAirport ? 60 : 10,
      mentionsTolls: journeyIncludesApplicableTolls(airportCode, {
        pickupIsAirport: outboundFromAirport,
        dropoffIsAirport: !outboundFromAirport,
      }),
    };
  }

  // Return: evaluate each leg separately.
  const outboundBullets = withChecks(
    bulletsForAirportLeg({ fromAirport: outboundFromAirport, airportCode }),
  );
  const returnFromAirport = !outboundFromAirport;
  const returnBullets = withChecks(
    bulletsForAirportLeg({ fromAirport: returnFromAirport, airportCode }),
  );

  const summaryParts = [
    `Outbound: ${summaryForAirportLeg({ fromAirport: outboundFromAirport, airportCode })}`,
    `Return: ${summaryForAirportLeg({ fromAirport: returnFromAirport, airportCode })}`,
  ];

  const emailIncludeLines = [
    "Outbound:",
    ...withoutChecks(outboundBullets).map((line) => `• ${line}`),
    "Return:",
    ...withoutChecks(returnBullets).map((line) => `• ${line}`),
  ];

  return {
    summary: summaryParts.join(" "),
    bullets: [
      ...outboundBullets.map((line) => `Outbound — ${line.replace(/^✓\s*/, "✓ ")}`),
      ...returnBullets.map((line) => `Return — ${line.replace(/^✓\s*/, "✓ ")}`),
    ],
    emailIncludeLines,
    outboundBullets,
    returnBullets,
    complimentaryWaitingMinutes: outboundFromAirport || returnFromAirport ? 60 : 10,
    mentionsTolls:
      journeyIncludesApplicableTolls(airportCode, {
        pickupIsAirport: outboundFromAirport,
        dropoffIsAirport: !outboundFromAirport,
      }) ||
      journeyIncludesApplicableTolls(airportCode, {
        pickupIsAirport: returnFromAirport,
        dropoffIsAirport: !returnFromAirport,
      }),
  };
}

/** Classic quote-tool airport trip: direction + optional return. */
export function getAirportTripInclusions(options: {
  isFromAirport: boolean;
  returnJourney?: boolean;
  airportCode?: AirportCodeLike | null;
}): JourneyInclusions {
  const isFromAirport = Boolean(options.isFromAirport);
  return getJourneyInclusions({
    pickupIsAirport: isFromAirport,
    dropoffIsAirport: !isFromAirport,
    airportCode: options.airportCode,
    returnJourney: options.returnJourney,
  });
}

/** Address-to-address (including hotel↔home). No airport fee/toll copy. */
export function getAddressToAddressInclusions(): JourneyInclusions {
  return getJourneyInclusions({
    pickupIsAirport: false,
    dropoffIsAirport: false,
  });
}

/** Helper for QuoteCard / assistant when journey kind is known. */
export function resolveJourneyInclusions(options: {
  isAirportTrip: boolean;
  isFromAirport: boolean;
  returnJourney?: boolean;
  airportCode?: AirportCodeLike | null;
  /** When true, neither end is treated as an airport (pure A2A). */
  addressToAddress?: boolean;
}): JourneyInclusions {
  if (options.addressToAddress || !options.isAirportTrip) {
    return getAddressToAddressInclusions();
  }
  return getAirportTripInclusions({
    isFromAirport: options.isFromAirport,
    returnJourney: options.returnJourney,
    airportCode: options.airportCode,
  });
}

/** Format email “Includes” block under the fixed fare. */
export function formatEmailFareIncludesBlock(
  inclusions: JourneyInclusions,
  fareLabel?: string | null,
): string {
  const lines: string[] = [];
  if (fareLabel?.trim()) {
    lines.push(`Fixed fare: ${fareLabel.trim()}`);
    lines.push("");
  }
  if (inclusions.emailIncludeLines.length === 0) {
    lines.push(inclusions.summary);
    return lines.join("\n");
  }
  lines.push("Includes:");
  for (const line of inclusions.emailIncludeLines) {
    if (line === "Outbound:" || line === "Return:") {
      lines.push("");
      lines.push(line);
    } else if (line.startsWith("•")) {
      lines.push(line);
    } else {
      lines.push(`• ${line}`);
    }
  }
  return lines.join("\n");
}

/** Compact HTML list for branded emails. */
export function formatEmailFareIncludesHtml(
  inclusions: JourneyInclusions,
  fareLabel?: string | null,
): string {
  const parts: string[] = [];
  if (fareLabel?.trim()) {
    parts.push(
      `<p style="margin:0 0 8px;font-size:15px;"><strong>Fixed fare:</strong> ${escapeHtml(fareLabel.trim())}</p>`,
    );
  }
  if (inclusions.emailIncludeLines.length === 0) {
    parts.push(
      `<p style="margin:0;font-size:14px;color:#475569;">${escapeHtml(inclusions.summary)}</p>`,
    );
    return parts.join("");
  }

  const items = inclusions.emailIncludeLines
    .map((line) => {
      if (line === "Outbound:" || line === "Return:") {
        return `</ul><p style="margin:12px 0 4px;font-size:13px;font-weight:700;color:#071C38;">${escapeHtml(line)}</p><ul style="margin:0;padding-left:18px;">`;
      }
      const text = line.replace(/^•\s*/, "");
      return `<li style="margin:0 0 4px;font-size:14px;color:#334155;">${escapeHtml(text)}</li>`;
    })
    .join("");

  parts.push(
    `<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#071C38;">Includes:</p>`,
  );
  parts.push(`<ul style="margin:0;padding-left:18px;">${items}</ul>`);
  return parts.join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Used for 5–7 / minibus transfers (online fixed fare). */
export const GROUP_QUOTE_FEE_NOTE =
  "Your fixed online fare lists only the inclusions that apply to your journey — airport fees and applicable tolls where they apply.";

/** Customer-facing waiting-time policy (source of truth for FAQ / UI helpers). */
export const AIRPORT_PICKUP_WAITING_COPY =
  "Airport pickups include up to 60 minutes complimentary waiting time, giving you time to clear passport control, collect your luggage and make your way to the agreed pickup point.";

export const AIRPORT_FLIGHT_MONITORING_COPY =
  "We monitor your flight where possible and adjust the planned collection time for early or delayed arrivals. Airport pickups include up to 60 minutes complimentary waiting time.";

/** Shown next to the flight-number field at booking/checkout (not during Get a Quote). */
export const BOOKING_FLIGHT_NUMBER_HELPER =
  "Used to monitor your flight and adjust your collection time if your flight arrives early or is delayed.";

export const NON_AIRPORT_WAITING_COPY =
  "Pickups from non-airport locations include up to 10 minutes complimentary waiting time from the agreed pickup time.";
