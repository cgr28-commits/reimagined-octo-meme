/**
 * Private day trips that can be booked and paid for online.
 *
 * The price is the listed per-car price (up to 4 passengers, Belfast pickup), taken
 * from this table on the server — never from the browser. It must match the prices
 * shown on the day trip pages (src/lib/tours.ts); scripts/check-bespoke-quote.ts
 * fails if they drift apart.
 */

export type DayTripOptionId = "half_day" | "full_day";

export type DayTripOption = { id: DayTripOptionId; label: string; priceGbp: number };

export type DayTrip = { slug: string; title: string; options: readonly DayTripOption[] };

const HALF_DAY = (priceGbp: number): DayTripOption => ({ id: "half_day", label: "Half day (around 4 hours)", priceGbp });
const FULL_DAY = (priceGbp: number): DayTripOption => ({ id: "full_day", label: "Full day (around 8 hours)", priceGbp });

export const DAY_TRIPS: readonly DayTrip[] = [
  { slug: "giants-causeway", title: "Giant's Causeway & Causeway Coast", options: [FULL_DAY(395)] },
  { slug: "belfast-city", title: "Belfast City Highlights", options: [HALF_DAY(195)] },
  { slug: "game-of-thrones", title: "Game of Thrones Filming Locations", options: [FULL_DAY(395)] },
  { slug: "antrim-coast", title: "Antrim Coast Scenic Drive", options: [HALF_DAY(195), FULL_DAY(395)] },
];

export const DAY_TRIP_MAX_PASSENGERS = 4;
/** Closer than this to pickup, the owner confirms the trip personally (no instant payment). */
export const DAY_TRIP_INSTANT_MIN_NOTICE_HOURS = 24;
/** How long the price stays payable (never past the pickup time). */
export const DAY_TRIP_INSTANT_VALIDITY_HOURS = 24;

export function getDayTrip(slug: unknown): DayTrip | undefined {
  return typeof slug === "string" ? DAY_TRIPS.find((trip) => trip.slug === slug) : undefined;
}

export function getDayTripOption(trip: DayTrip, optionId: unknown): DayTripOption | undefined {
  if (optionId === undefined || optionId === null || optionId === "") return trip.options.length === 1 ? trip.options[0] : undefined;
  return trip.options.find((option) => option.id === optionId);
}

/** Northern Ireland postcode outside Belfast (BT1–BT17 is Belfast). */
const BT_POSTCODE = /\bBT(\d{1,2})\s?\d[A-Z]{2}\b/i;

export function addressLooksOutsideBelfast(address: string): boolean {
  const match = BT_POSTCODE.exec(address);
  if (!match) return false;
  const district = Number(match[1]);
  return district < 1 || district > 17;
}

export type DayTripInfo = {
  slug: string;
  title: string;
  option: DayTripOptionId;
  optionLabel: string;
  /** The customer told us the pickup is in Belfast (hotel, home or cruise terminal). */
  pickupInBelfast: boolean;
};

/**
 * The listed price, when the trip can be paid for straight away:
 * a Belfast pickup with enough notice. Anything else goes to the owner to price.
 */
export function dayTripInstantPriceGbp(
  info: DayTripInfo,
  journey: { pickupAddress: string; passengers: number },
  pickupAt: Date | null,
  now: Date,
): number | null {
  const trip = getDayTrip(info.slug);
  const option = trip ? getDayTripOption(trip, info.option) : undefined;
  if (!trip || !option) return null;
  if (!info.pickupInBelfast || addressLooksOutsideBelfast(journey.pickupAddress)) return null;
  if (journey.passengers < 1 || journey.passengers > DAY_TRIP_MAX_PASSENGERS) return null;
  if (!pickupAt || pickupAt.getTime() - now.getTime() < DAY_TRIP_INSTANT_MIN_NOTICE_HOURS * 3_600_000) return null;
  return option.priceGbp;
}
