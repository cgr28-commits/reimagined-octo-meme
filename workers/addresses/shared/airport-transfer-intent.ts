/**
 * Infer airport-transfer intent from addresses when the client omits airportCode.
 * Without this, Knocknagoney → BFS prices as point-to-point (£55) and skips the
 * Belfast airport distance floor (£65).
 */

import {
  matchServedAirportCode,
  type ServedAirportCode,
} from "./served-airports";

export type InferredAirportTransfer = {
  airportCode: ServedAirportCode;
  fromAirport: boolean;
};

/**
 * Prefer an explicit client airportCode (BFS/BHD/DUB/LDY). Otherwise detect a
 * single served airport on one end of the journey.
 */
export function resolveAirportTransferIntent(options: {
  airportCode?: string | null;
  fromAirport?: boolean | null;
  pickupAddress: string;
  dropoffAddress: string;
}): InferredAirportTransfer | null {
  const raw = String(options.airportCode ?? "")
    .trim()
    .toUpperCase();
  if (raw === "BFS" || raw === "BHD" || raw === "DUB" || raw === "LDY") {
    return {
      airportCode: raw,
      fromAirport: options.fromAirport === true,
    };
  }

  const pickupCode = matchServedAirportCode(options.pickupAddress);
  const dropoffCode = matchServedAirportCode(options.dropoffAddress);

  if (pickupCode && dropoffCode && pickupCode !== dropoffCode) {
    // Airport-to-airport — keep explicit body handling elsewhere; not a floor case.
    return null;
  }
  if (pickupCode && !dropoffCode) {
    return { airportCode: pickupCode, fromAirport: true };
  }
  if (dropoffCode && !pickupCode) {
    return { airportCode: dropoffCode, fromAirport: false };
  }
  return null;
}
