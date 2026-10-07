/**
 * Executive journey fare is the Saloon journey fare times an owner multiplier.
 * There is no fixed Executive uplift, £105 floor, or nearest-£5 rounding.
 * Airport pickups include Meet & Greet and barrier/parking in that fare.
 */

export const DEFAULT_EXECUTIVE_MULTIPLIER = 1.5;

export const EXECUTIVE_AIRPORT_PICKUP_INCLUDED =
  "Airport Executive pickups include Meet & Greet, a personalised name board, luggage assistance, barrier and parking, bottled water and phone charging.";

/** Customer wording. Does not name a manufacturer or model. */
export const BUSINESS_CLASS_AIRPORT_PICKUP_INCLUDED =
  "Airport pickups include Meet & Greet, a personalised name board, luggage assistance, barrier and parking, bottled water and phone charging.";

export const AIRPORT_ACCESS_INCLUDED_HEADING = "Airport access included";

export const AIRPORT_ACCESS_INCLUDED_BODY =
  "Airport access and applicable tolls included in your fixed price.";

/** Customer wording when the journey direction is known. Not a separate charge. */
export const EXPRESS_PICKUP_INCLUDED_HEADING = "Express Pickup Included";
export const EXPRESS_DROPOFF_INCLUDED_HEADING = "Express Drop-Off Included";
export const EXPRESS_PICKUP_INCLUDED_BODY =
  "Airport pickup access and applicable charges are included in your fixed price.";
export const EXPRESS_DROPOFF_INCLUDED_BODY =
  "Airport drop-off access and applicable charges are included in your fixed price.";

export function includedAirportAccessCopy(service: "pick-up" | "drop-off"): {
  heading: string;
  body: string;
} {
  if (service === "pick-up") {
    return {
      heading: EXPRESS_PICKUP_INCLUDED_HEADING,
      body: EXPRESS_PICKUP_INCLUDED_BODY,
    };
  }
  return {
    heading: EXPRESS_DROPOFF_INCLUDED_HEADING,
    body: EXPRESS_DROPOFF_INCLUDED_BODY,
  };
}

export function isExecutiveVehicle(vehicle: string | null | undefined): boolean {
  const value = String(vehicle ?? "").toLowerCase();
  return value.includes("executive") || value.includes("business class");
}
