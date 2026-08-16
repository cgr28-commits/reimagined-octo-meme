/**
 * Central journey inclusion copy — airport pickup vs drop-off, waiting time, tolls.
 * Do not scatter contradictory fee wording across UI components.
 *
 * Note on fares: express pickup/drop-off fees and tolls are commercial inclusions
 * in the fixed quoted fare. `pricing-config.json` currently has
 * `operational.airportChargesGbp` and `defaultTollsGbp` set to null — they are
 * NOT separate calculator add-ons. This module only controls wording.
 */

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

const EXPRESS_PICKUP = "Express pickup fee included";
const EXPRESS_DROPOFF = "Express drop-off fee included";
const WAITING_60 = "60 minutes complimentary airport waiting time";
const TOLLS = "Applicable tolls included";

function isDublinAirport(code?: AirportCodeLike | null): boolean {
  return (code ?? "").trim().toUpperCase() === "DUB";
}

/** Tolls are only mentioned for Dublin Airport fixed fares (commercial inclusion). */
export function journeyIncludesApplicableTolls(
  airportCode?: AirportCodeLike | null,
  options?: { pickupIsAirport?: boolean; dropoffIsAirport?: boolean },
): boolean {
  if (!isDublinAirport(airportCode)) {
    return false;
  }
  return Boolean(options?.pickupIsAirport || options?.dropoffIsAirport);
}

function bulletsForAirportLeg(options: {
  fromAirport: boolean;
  airportCode?: AirportCodeLike | null;
}): string[] {
  const { fromAirport, airportCode } = options;
  const items: string[] = [];

  if (journeyIncludesApplicableTolls(airportCode, {
    pickupIsAirport: fromAirport,
    dropoffIsAirport: !fromAirport,
  })) {
    items.push(TOLLS);
  }

  if (fromAirport) {
    items.push(EXPRESS_PICKUP);
    items.push(WAITING_60);
  } else {
    items.push(EXPRESS_DROPOFF);
  }

  return items;
}

function summaryForAirportLeg(fromAirport: boolean): string {
  if (fromAirport) {
    return "Fixed price including the applicable express pickup fee.";
  }
  return "Fixed price including the applicable express drop-off fee.";
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
    return {
      summary: "Fixed price for your journey.",
      bullets: [],
      emailIncludeLines: [],
      outboundBullets: [],
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
      summary: summaryForAirportLeg(outboundFromAirport),
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
    `Outbound: ${summaryForAirportLeg(outboundFromAirport)}`,
    `Return: ${summaryForAirportLeg(returnFromAirport)}`,
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
