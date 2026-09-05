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

/** Owner override wins. Otherwise stored flight value, then freshly parsed flight data. */
export function chooseDublinArrivalTerminal(input: {
  stored?: DublinArrivalTerminal | string | null;
  source?: DublinArrivalTerminalSource | string | null;
  fromFlight?: DublinArrivalTerminal | string | null;
}): DublinArrivalTerminal | null {
  const stored = parseDublinArrivalTerminal(input.stored);
  if (input.source === "owner" && stored) return stored;
  return stored ?? parseDublinArrivalTerminal(input.fromFlight);
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
}): DublinArrivalTerminal | null {
  const outboundDone = booking.outboundJourneyStatus === "completed";
  const nextIsReturn =
    Boolean(booking.returnJourney) &&
    Boolean(booking.nextUnfinishedLegDate?.trim()) &&
    booking.nextUnfinishedLegDate === (booking.returnDate || "").trim() &&
    booking.nextUnfinishedLegDate !== (booking.tripDate || "").trim();
  const useReturn = Boolean(booking.returnJourney) && (outboundDone || nextIsReturn);
  return parseDublinArrivalTerminal(
    useReturn ? booking.returnDublinArrivalTerminal : booking.dublinArrivalTerminal,
  );
}
