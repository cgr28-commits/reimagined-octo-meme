/**
 * When the authoritative quote request starts, and which vehicles to price.
 * The numeric fare still comes from /quote/calculate. This does not price locally.
 */

/** No artificial wait after the customer finishes the inputs. */
export const QUOTE_FARE_START_DELAY_MS = 0;

export type QuoteFareRequestKeyInput = {
  pickup: string;
  dropoff: string;
  passengers: number;
  suitcases: number;
  vehicle: string;
  outboundDate: string;
  outboundTime: string;
  returnJourney: boolean;
  returnDate: string;
  returnTime: string;
};

export function quoteFareRequestKey(input: QuoteFareRequestKeyInput): string {
  return [
    input.pickup.trim(),
    input.dropoff.trim(),
    input.passengers,
    input.suitcases,
    input.vehicle,
    input.outboundDate.trim(),
    input.outboundTime.trim(),
    input.returnJourney ? "return" : "one-way",
    input.returnJourney ? input.returnDate.trim() : "",
    input.returnJourney ? input.returnTime.trim() : "",
  ].join("\u001f");
}

/**
 * Selected vehicle is requested immediately. The other eligible vehicle is
 * requested in parallel so switching does not start a second sequential wait.
 */
export function quoteFareVehiclesToRequest(input: {
  selectedVehicle: string;
  automaticVehicle: string;
  minibusVehicle: string;
  publicMinibusEnabled: boolean;
  requiresMinibus: boolean;
}): string[] {
  const selected = input.selectedVehicle;
  if (!input.publicMinibusEnabled || input.requiresMinibus) return [selected];
  const alternate =
    selected === input.minibusVehicle ? input.automaticVehicle : input.minibusVehicle;
  if (!alternate || alternate === selected) return [selected];
  return [selected, alternate];
}
