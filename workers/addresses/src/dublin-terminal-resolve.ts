/**
 * Resolve and persist Dublin T1/T2 from the existing AeroDataBox flight lookup.
 * Owner overrides are never overwritten.
 */

import {
  chooseDublinArrivalTerminal,
  isDublinAirportCode,
  parseDublinArrivalTerminal,
  type DublinArrivalTerminal,
} from "../shared/dublin-arrival-terminal";
import { lookupFlight } from "../shared/flight-lookup";
import {
  getPaidBookingRecord,
  paidBookingStoreConfigured,
  updatePaidBookingFields,
} from "./paid-booking-store";
import type { TrackingJobRecord } from "../shared/tracking";

const AIRPORT_NAMES: Record<string, string> = {
  BFS: "Belfast International",
  BHD: "George Best Belfast City",
  DUB: "Dublin Airport",
  LDY: "City of Derry",
};

export async function resolveDublinArrivalTerminalForJob(
  job: TrackingJobRecord,
  env: { TRACKING_STORE?: KVNamespace; AERODATABOX_RAPIDAPI_KEY?: string },
): Promise<DublinArrivalTerminal | null> {
  if (!isDublinAirportCode(job.airportCode)) return null;

  const isReturn = job.journeyLeg === "return";
  const paid =
    job.paymentReference && paidBookingStoreConfigured(env.TRACKING_STORE)
      ? await getPaidBookingRecord(env.TRACKING_STORE, job.paymentReference)
      : null;

  const stored = isReturn ? paid?.returnDublinArrivalTerminal : paid?.dublinArrivalTerminal;
  const source = isReturn
    ? paid?.returnDublinArrivalTerminalSource
    : paid?.dublinArrivalTerminalSource;

  if (source === "owner") {
    return parseDublinArrivalTerminal(stored);
  }

  let fromFlight: DublinArrivalTerminal | null = null;
  const flightNumber = job.flightNumber?.trim();
  if (flightNumber && env.AERODATABOX_RAPIDAPI_KEY?.trim()) {
    try {
      const result = await lookupFlight(env.AERODATABOX_RAPIDAPI_KEY, {
        flightNumber,
        tripDate: job.tripDate,
        airportCode: "DUB",
        airportName: AIRPORT_NAMES.DUB,
        direction: "from-airport",
      });
      if (result.ok) {
        fromFlight = parseDublinArrivalTerminal(result.flight.arrivalTerminal);
      }
    } catch {
      fromFlight = null;
    }
  }

  const resolved = chooseDublinArrivalTerminal({ stored, source, fromFlight });

  if (
    resolved &&
    paid &&
    env.TRACKING_STORE &&
    source !== "owner" &&
    stored !== resolved
  ) {
    try {
      await updatePaidBookingFields(
        env.TRACKING_STORE,
        paid.paymentReference,
        isReturn
          ? {
              returnDublinArrivalTerminal: resolved,
              returnDublinArrivalTerminalSource: "flight",
            }
          : {
              dublinArrivalTerminal: resolved,
              dublinArrivalTerminalSource: "flight",
            },
        { appendAudit: true, changedBy: "System" },
      );
    } catch {
      /* persist is best-effort */
    }
  }

  return resolved;
}
