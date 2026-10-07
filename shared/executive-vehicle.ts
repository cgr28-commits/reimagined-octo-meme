/**
 * Executive journey fare is the Saloon journey fare times an owner multiplier.
 * There is no fixed Executive uplift, £105 floor, or nearest-£5 rounding.
 * Airport pickups include Meet & Greet and barrier/parking in that fare.
 */

export const DEFAULT_EXECUTIVE_MULTIPLIER = 1.5;

export const EXECUTIVE_AIRPORT_PICKUP_INCLUDED =
  "Airport Executive pickups include Meet & Greet, a personalised name board, luggage assistance, barrier and parking, bottled water and phone charging.";

export function isExecutiveVehicle(vehicle: string | null | undefined): boolean {
  return String(vehicle ?? "").toLowerCase().includes("executive");
}
