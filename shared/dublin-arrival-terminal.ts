/**
 * Dublin Airport arrival terminal (T1 / T2) for customer pickup instructions.
 * Parsed from the existing AeroDataBox flight lookup when available.
 * Never guess — unknown stays unresolved until flight data or an owner override.
 */

export type DublinArrivalTerminal = "T1" | "T2";

export type DublinArrivalTerminalSource = "flight" | "owner" | "unresolved";

export function parseDublinArrivalTerminal(value: unknown): DublinArrivalTerminal | null {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!raw) return null;
  if (raw === "1" || raw === "T1" || raw === "TERMINAL1" || raw === "TERM1") {
    return "T1";
  }
  if (raw === "2" || raw === "T2" || raw === "TERMINAL2" || raw === "TERM2") {
    return "T2";
  }
  return null;
}

export function dublinArrivalTerminalLabel(
  terminal: DublinArrivalTerminal | null | undefined,
): string {
  if (terminal === "T1") return "Terminal 1";
  if (terminal === "T2") return "Terminal 2";
  return "Needs confirmation";
}

export function isDublinAirportCode(code: string | null | undefined): boolean {
  return String(code ?? "").trim().toUpperCase() === "DUB";
}

/**
 * Terminal the customer picked in address search ("Dublin Airport Terminal 1, Co. Dublin, Ireland").
 * Only an explicit "Dublin Airport … Terminal 1/2" label counts; anything else stays unresolved.
 */
export function dublinTerminalFromAddress(address: string | null | undefined): DublinArrivalTerminal | null {
  const text = String(address ?? "");
  const match = /\bdublin airport\b[^,]*?\bterminal\s*([12])\b/i.exec(text);
  if (!match) return null;
  return match[1] === "1" ? "T1" : "T2";
}

/**
 * Owner override wins. Otherwise stored flight value, then freshly parsed flight data,
 * then the terminal the customer picked in address search (never saved as flight data).
 */
export function chooseDublinArrivalTerminal(input: {
  stored?: DublinArrivalTerminal | string | null;
  source?: DublinArrivalTerminalSource | string | null;
  fromFlight?: DublinArrivalTerminal | string | null;
  fromAddress?: string | null;
}): DublinArrivalTerminal | null {
  const stored = parseDublinArrivalTerminal(input.stored);
  if (input.source === "owner" && stored) return stored;
  return stored ?? parseDublinArrivalTerminal(input.fromFlight) ?? dublinTerminalFromAddress(input.fromAddress);
}

/** Terminal for the active unfinished pickup leg. */
export function activeLegDublinArrivalTerminal(booking: {
  dublinArrivalTerminal?: DublinArrivalTerminal | string | null;
  returnDublinArrivalTerminal?: DublinArrivalTerminal | string | null;
  returnJourney?: boolean;
  outboundJourneyStatus?: string;
  nextUnfinishedLegDate?: string;
  tripDate?: string;
  returnDate?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
}): DublinArrivalTerminal | null {
  const outboundDone = booking.outboundJourneyStatus === "completed";
  const nextIsReturn =
    Boolean(booking.returnJourney) &&
    Boolean(booking.nextUnfinishedLegDate?.trim()) &&
    booking.nextUnfinishedLegDate === (booking.returnDate || "").trim() &&
    booking.nextUnfinishedLegDate !== (booking.tripDate || "").trim();
  const useReturn = Boolean(booking.returnJourney) && (outboundDone || nextIsReturn);
  // The return leg picks up where the outbound dropped off.
  return (
    parseDublinArrivalTerminal(
      useReturn ? booking.returnDublinArrivalTerminal : booking.dublinArrivalTerminal,
    ) ?? dublinTerminalFromAddress(useReturn ? booking.dropoffLabel : booking.pickupLabel)
  );
}
