/**
 * Price a journey exactly the way the public quote tool does.
 *
 * Quick Quotes, Personal Quotes and Personal Quote checkout all call the same
 * `/quote/calculate` handler the website's quote card uses, so the owner's
 * live pricing settings (mileage formula, minimums, surcharges, drive-to-pickup
 * charge, route resolution) are applied identically everywhere. Only the
 * discount differs, and callers apply that afterwards.
 */

import { handleQuoteCalculateRequest } from "./quote-handlers";

export type MainQuoteEnv = Parameters<typeof handleQuoteCalculateRequest>[2];

/** Request body the public quote card sends to /quote/calculate. */
export type MainQuoteBody = {
  pickupAddress: string;
  dropoffAddress: string;
  pickupPlaceId?: string | null;
  dropoffPlaceId?: string | null;
  airportCode?: string | null;
  fromAirport?: boolean;
  returnJourney: boolean;
  outboundDate?: string;
  outboundTime?: string;
  returnDate?: string;
  returnTime?: string;
  passengers: number;
  suitcases: number;
  /** Vehicle label (e.g. "Standard Saloon (1–4 passengers)") or choice. */
  vehicleType?: string;
  vehicleChoice?: string;
};

export type MainQuoteResult =
  | {
      ok: true;
      /** Transfer price before optional Express/terminal access — same as the quote card. */
      amount: number;
      vehicleType: string;
      returnJourney: boolean;
      /** Fare parts exactly as the quote card receives them (for breakdowns). */
      journeyFareGbp?: number;
      nightWeekendSurchargeGbp?: number;
      airportFixedCostsGbp?: number;
      outboundOneWayBeforeAccessGbp?: number;
      returnOneWayBeforeAccessGbp?: number;
      preserveBfsMinimumPence?: boolean;
      payload: Record<string, unknown>;
    }
  | { ok: false; status: number; reason?: string; message: string };

/**
 * Build the exact body the quote card sends. Only addresses and place IDs are
 * passed — never browser coordinates or route metrics — so the Worker resolves
 * the route itself and every caller gets the same distance.
 */
export function mainQuoteRequestBody(input: MainQuoteBody): Record<string, unknown> {
  return {
    pickupAddress: input.pickupAddress,
    dropoffAddress: input.dropoffAddress,
    ...(input.pickupPlaceId ? { pickupPlaceId: input.pickupPlaceId } : {}),
    ...(input.dropoffPlaceId ? { dropoffPlaceId: input.dropoffPlaceId } : {}),
    ...(input.airportCode ? { airportCode: input.airportCode } : {}),
    ...(typeof input.fromAirport === "boolean" ? { fromAirport: input.fromAirport } : {}),
    returnJourney: input.returnJourney,
    journeyMode: input.returnJourney ? "return" : "one-way",
    outboundDate: input.outboundDate ?? "",
    outboundTime: input.outboundTime ?? "",
    returnDate: input.returnJourney ? (input.returnDate ?? "") : "",
    returnTime: input.returnJourney ? (input.returnTime ?? "") : "",
    passengers: input.passengers,
    suitcases: input.suitcases,
    ...(input.vehicleType ? { vehicleType: input.vehicleType } : {}),
    ...(input.vehicleChoice ? { vehicleChoice: input.vehicleChoice } : {}),
    quoteProtocol: "optional-terminal-access-v4",
  };
}

/**
 * Run the public quote handler in-process. `forwardAuthFrom` passes the
 * caller's own owner/driver credentials (e.g. the owner creating a Quick
 * Quote) so owner-only vehicles behave as they do in the owner tools; omit it
 * for customer-facing calls.
 */
export async function priceWithMainQuoteTool(
  body: Record<string, unknown>,
  env: MainQuoteEnv,
  options: { forwardAuthFrom?: Request } = {},
): Promise<MainQuoteResult> {
  const headers = new Headers({ "Content-Type": "application/json", Accept: "application/json" });
  if (options.forwardAuthFrom) {
    for (const name of ["X-Owner-Key", "X-Driver-Key", "X-Driver-Session", "Authorization"]) {
      const value = options.forwardAuthFrom.headers.get(name);
      if (value) headers.set(name, value);
    }
  }
  const request = new Request("https://internal.invalid/quote/calculate", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  let response: Response;
  try {
    response = await handleQuoteCalculateRequest(request, null, env);
  } catch (error) {
    console.warn(`[main-quote] handler threw: ${error instanceof Error ? error.message : "unknown"}`);
    return { ok: false, status: 503, message: "We could not calculate a price right now. Please try again." };
  }
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload || !response.ok || payload.ok !== true) {
    return {
      ok: false,
      status: response.ok ? 422 : response.status,
      ...(payload?.reason ? { reason: String(payload.reason) } : {}),
      message: String(payload?.message ?? payload?.error ?? "We could not calculate a price for that journey."),
    };
  }
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount < 1) {
    return { ok: false, status: 422, message: "We could not calculate a price for that journey." };
  }
  const part = (key: string) => {
    const value = Number(payload[key]);
    return typeof payload[key] === "number" && Number.isFinite(value) ? { [key]: value } : {};
  };
  return {
    ok: true,
    amount: Math.round(amount * 100) / 100,
    vehicleType: String(payload.vehicleType ?? ""),
    returnJourney: payload.returnJourney === true,
    ...part("journeyFareGbp"),
    ...part("nightWeekendSurchargeGbp"),
    ...part("airportFixedCostsGbp"),
    ...part("outboundOneWayBeforeAccessGbp"),
    ...part("returnOneWayBeforeAccessGbp"),
    ...(payload.preserveBfsMinimumPence === true ? { preserveBfsMinimumPence: true } : {}),
    payload,
  };
}
