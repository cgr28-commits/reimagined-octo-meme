import assert from "node:assert/strict";
import { defaultOwnerPricingSettings, validateOwnerPricingInput, toPublicOwnerPricingConfig } from "../shared/owner-pricing-config";
import { defaultSpecialDateFares } from "../shared/special-date-fares";
import { createBelfastEvent } from "../shared/belfast-events";
import { publishedVenuePickup } from "../shared/event-venue-pickups";
import { eventFareShareLabel } from "../shared/event-fare-share";
import { applyTripPremium, specialFareLabel, tripSurchargeRate } from "../src/lib/point-to-point-premium";
import { handleQuoteCalculateRequest } from "../workers/addresses/src/quote-handlers";
import { calculateQuote, calculatePointToPointQuote } from "../src/lib/quote";
import { SALOON_VEHICLE } from "../src/lib/vehicle-selection";
import { saveOwnerPricingSettings, getOwnerPricingSettings } from "../workers/addresses/src/owner-pricing-store";

const settings = defaultOwnerPricingSettings();
const venue = "Boucher Rd., Belfast BT12 6HR";
const airport = "Dublin Airport";
const endpoints = { pickup: airport, dropoff: venue };
const rate = (date: string, time: string, dropoff = venue) =>
  tripSurchargeRate(date, time, settings, { pickup: airport, dropoff });

assert.equal(rate("2027-05-20", "12:00"), 0);
assert.equal(rate("2027-05-21", "00:00"), 0.25);
assert.equal(rate("2027-05-22", "12:00"), 0.25);
assert.equal(rate("2027-05-23", "23:59"), 0.25);
assert.equal(rate("2027-05-24", "12:00"), 0);
assert.equal(rate("2027-05-21", "12:00", "Belfast City Hall"), 0);
assert.equal(rate("2026-12-30", "12:00"), 0.2);
assert.equal(rate("2026-12-31", "00:00"), 0.5);
assert.equal(rate("2027-01-01", "23:59"), 0.5);
assert.equal(rate("2027-01-02", "12:00"), 0.1);
assert.equal(rate("2028-01-01", "12:00", "Belfast City Hall"), 0.5);
const schedule = { endpoints, outboundDate: "2027-05-21", outboundTime: "12:00",
  returnDate: "2027-05-21", returnTime: "20:00", returnJourney: true };
const concertReturn = applyTripPremium(100, schedule, undefined, { pricing: settings });
assert.equal(concertReturn.premiumAmount, 25);
assert.equal(concertReturn.total, 213.75, "5% off £125 into Boucher Road and £100 on the way back");
assert.equal(specialFareLabel(schedule, settings), "Garth Brooks 25% surcharge");
assert.equal(applyTripPremium(100, { ...schedule, endpoints: { pickup: venue, dropoff: airport } },
  undefined, { pricing: settings, returnOneWayFare: 80 }).premiumAmount, 20);
const metrics = { distanceKm: 160, durationMinutes: 105 };
const dub = (date: string) => calculateQuote(venue, "DUB", SALOON_VEHICLE, false,
  { outboundDate: date, outboundTime: "12:00" }, metrics, true, settings)!;
const normal = dub("2027-05-20");
const concert = dub("2027-05-21");
assert.equal(concert.airportFixedCostsGbp, normal.airportFixedCostsGbp);
assert.equal(concert.journeyFareGbp, normal.journeyFareGbp! * 1.25);
const local = (withTolls: boolean) => calculatePointToPointQuote("Dublin City", venue, SALOON_VEHICLE, true,
  schedule, metrics, null, undefined, settings, { tollAllowance: { outboundGbp: withTolls ? 5 : 0, returnGbp: 0 } })!;
assert.equal(local(true).amount, local(false).amount + 5);
assert.equal(local(true).nightWeekendSurchargeGbp, local(false).nightWeekendSurchargeGbp);

const stadium = "Croke Park, Jones' Road, Dublin 3";
const hotel = "The Croke Park Hotel, Jones' Road, Dublin 3";
const date = "2027-08-18";
const created = createBelfastEvent({ title: "Concert", venueId: "croke-park", date, category: "concert",
  pickupPoint: "Gate 7 Collection Point", startTime: "19:00", endTime: "01:00", summary: "Evening concert." });
assert.ok(created.ok);
const listed = { ...created.record, status: "published" as const };
const pickup = publishedVenuePickup(listed, date);
assert.ok(pickup);
const eventPricing = { ...settings, eventVenuePickups: [pickup] };
const localTrip = (from: string, to: string, when = date, time = "15:00") => ({
  endpoints: { pickup: from, dropoff: to }, outboundDate: when, outboundTime: time,
});
const premium = (from: string, to = hotel) => applyTripPremium(100, localTrip(from, to), undefined, { pricing: eventPricing });
assert.equal(premium(stadium).total, 125);
assert.equal(eventFareShareLabel(premium(stadium).total, { eventTransfer: true, passengers: 4 }), "£31.25 each for 4 sharing");
assert.equal(premium("Gate 7 Collection Point, Dublin").total, 125);
for (const from of [hotel, "The Croke Park, Dublin", "Croke Park Hotel, Dublin", "Croke Park, Belfast",
    "Other Guesthouse, Croke Park, Dublin", "Croke Park, Dublin Road, Belfast", airport]) {
  assert.equal(premium(from, stadium).total, 100, from);
}
const returning = { ...localTrip(hotel, stadium), returnJourney: true, returnDate: date, returnTime: "21:00" };
assert.equal(applyTripPremium(100, returning, undefined, { pricing: eventPricing }).total, 213.75);
assert.equal(specialFareLabel(returning, eventPricing), "Concert venue pickup 25% surcharge");
assert.equal(specialFareLabel(localTrip(stadium, hotel, "2027-08-19", "01:00"), eventPricing), "Concert venue pickup 25% surcharge");
assert.equal(specialFareLabel(localTrip(stadium, hotel, "2027-08-19", "01:01"), eventPricing), undefined);
for (const status of ["draft", "postponed", "cancelled"] as const) {
  assert.equal(publishedVenuePickup({ ...listed, status }, date), null);
}
assert.equal(publishedVenuePickup({ ...listed, venueName: "Dublin city centre", venueId: "dublin-city-centre", pickupPoint: "" }, date), null);
const parade = publishedVenuePickup({ ...listed, venueName: "Dublin city centre", venueId: "dublin-city-centre" }, date);
assert.deepEqual(parade?.venueNames, []);
assert.equal(parade?.pickupPoint, "Gate 7 Collection Point");
const manual = { ...defaultSpecialDateFares()[0], name: "Stadium pickup", venue: "Croke Park",
  direction: "from" as const, start: date + "T20:00", end: date + "T23:00", rate: 0.15 };
const override = { ...eventPricing, specialDateFares: [manual] };
assert.equal(tripSurchargeRate(date, "15:00", override, { pickup: stadium }), 0);
assert.equal(tripSurchargeRate(date, "20:00", override, { pickup: stadium }), 0.15);
assert.equal(tripSurchargeRate(date, "20:00", override, { pickup: "Croke Park Stadium, Dublin" }), 0.15);
assert.equal(tripSurchargeRate(date, "20:00", override, { pickup: "Gate 7 Collection Point, Dublin" }), 0.25);
assert.equal(tripSurchargeRate(date, "20:00", override, { pickup: hotel }), 0);
assert.equal(tripSurchargeRate(date, "20:00", { ...eventPricing, specialDateFares: [
  { ...manual, direction: "all", rate: 0.5 },
] }, { pickup: stadium }), 0.5);
const legacy = { ...settings };
delete legacy.specialDateFares;
const migrated = validateOwnerPricingInput(legacy);
assert.ok(migrated.ok);
assert.deepEqual(migrated.settings.specialDateFares, defaultSpecialDateFares());
assert.deepEqual(toPublicOwnerPricingConfig(migrated.settings).specialDateFares, defaultSpecialDateFares());
assert.equal(validateOwnerPricingInput({ ...settings, specialDateFares: [{ ...defaultSpecialDateFares()[0], venue: "" }] }).ok, false);
const map = new Map<string, string>();
const store = {
  async get(key: string, type?: string) {
    const value = map.get(key);
    return value == null ? null : type === "json" ? JSON.parse(value) : value;
  },
  async put(key: string, value: string) { map.set(key, value); },
} as unknown as KVNamespace;
async function checkSavedRules() {
  const rules = [{ ...defaultSpecialDateFares()[0], venue: "Croke Park", rate: 0.35 }];
  await saveOwnerPricingSettings(store, { ...settings, specialDateFares: rules });
  await saveOwnerPricingSettings(store, legacy);
  assert.deepEqual((await getOwnerPricingSettings(store)).specialDateFares, rules);
  await saveOwnerPricingSettings(store, { ...settings, specialDateFares: [] });
  assert.deepEqual((await getOwnerPricingSettings(store)).specialDateFares, []);
  await saveOwnerPricingSettings(store, settings);
  for (const [date, expected, label] of [
    ["2027-05-21", concert.amount, "Garth Brooks 25% surcharge"],
    ["2026-12-31", dub("2026-12-31").amount, "New Year 50% surcharge"],
  ] as const) {
    const request = new Request("https://example.test/quote/calculate", {
      method: "POST",
      body: JSON.stringify({ pickupAddress: airport, dropoffAddress: venue, vehicleType: SALOON_VEHICLE,
        passengers: 1, suitcases: 1, returnJourney: false, outboundDate: date, outboundTime: "12:00",
        routeMetrics: metrics, airportCode: "DUB", fromAirport: true }),
    });
    const response = await handleQuoteCalculateRequest(request, null, { TRACKING_STORE: store });
    const quote = await response.json() as { amount: number; nightWeekendSurchargeLabel: string };
    assert.equal(response.status, 200, JSON.stringify(quote));
    assert.equal(quote.amount, expected);
    assert.equal(quote.nightWeekendSurchargeLabel, label);
  }
  console.log("Special date fare, return leg, fixed fee and owner settings checks passed.");
}
void checkSavedRules();
