/**
 * Empty Run discount: Sunday 15 Nov 2026 scenario.
 * Confirmed job: Dublin Airport pickup 17:30 (driver leaves Belfast ~14:00).
 */
import assert from "node:assert/strict";
import {
  DEFAULT_EMPTY_RUN_SETTINGS,
  evaluateEmptyRunDiscount,
  normalizeEmptyRunSettings,
  type EmptyRunRequest,
} from "../shared/empty-run-pricing";
import { evaluateSmartAvailability, type SmartOccupiedJob } from "../shared/smart-conflict";
import { DEFAULT_SMART_OPS_CONFIG } from "../shared/smart-ops-config";

const BASE = { lat: 54.66598, lng: -5.97026 }; // Glengormley
const BELFAST_CITY = { lat: 54.5973, lng: -5.9301 };
const DUBLIN_AIRPORT = { lat: 53.4264, lng: -6.2499 };
const NOW = new Date("2026-11-13T00:10:00Z");
const on = normalizeEmptyRunSettings({ ...DEFAULT_EMPTY_RUN_SETTINGS, enabled: true });

const sundayDublinPickup: SmartOccupiedJob = {
  id: "MAT-SUNDAY-DUB",
  pickupLabel: "Dublin Airport",
  dropoffLabel: "Belfast",
  pickup: DUBLIN_AIRPORT,
  dropoff: BELFAST_CITY,
  tripDate: "2026-11-15",
  tripTime: "17:30",
  durationMinutes: 120,
  airportCode: "DUB",
  isFromAirport: true,
  vehicle: "Standard Saloon (1–4 passengers)",
};

const fare = { amountGbp: 236, journeyFareGbp: 226, airportFixedCostsGbp: 10, nightWeekendSurchargeGbp: 20 };

function req(time: string, extra: Partial<EmptyRunRequest> = {}): EmptyRunRequest {
  return {
    pickupLabel: "Belfast City Hall",
    dropoffLabel: "Dublin Airport",
    pickup: BELFAST_CITY,
    dropoff: DUBLIN_AIRPORT,
    airportCode: "DUB",
    fromAirport: false,
    tripDate: "2026-11-15",
    tripTime: time,
    durationMinutes: 115,
    returnJourney: false,
    vehicle: "Standard Saloon (1–4 passengers)",
    ...extra,
  };
}

const run = (r: EmptyRunRequest, settings = on, occupied = [sundayDublinPickup]) =>
  evaluateEmptyRunDiscount({ request: r, fare, occupied, base: BASE, settings, now: NOW });

// ON by default; the owner switch OFF → nothing changes.
assert.equal(DEFAULT_EMPTY_RUN_SETTINGS.enabled, true);
assert.equal(run(req("14:00"), normalizeEmptyRunSettings({ ...DEFAULT_EMPTY_RUN_SETTINGS, enabled: false })).reason, "EMPTY_RUN_DISABLED");
// A stored "OFF" from the dashboard must stay off.
assert.equal(normalizeEmptyRunSettings({ enabled: false }).enabled, false);

// 14:00 Belfast → Dublin Airport arrives ~15:55, 95 min before the 17:30 pickup → discounted.
const at14 = run(req("14:00"));
assert.equal(at14.applied, true, JSON.stringify(at14));
assert.equal(at14.fare!.amountGbp, 185); // 25% off would be £180, so the £185 floor applies
console.log("14:00 →", at14.fare, "saving", at14.savingGbp);

// 16:00 (customer's preferred) → normal price, plus a cheaper earlier time offered.
const at16 = run(req("16:00"));
assert.equal(at16.applied, false);
assert.equal(at16.reason, "EMPTY_RUN_OFFER_OTHER_TIME");
assert.equal(at16.offer!.direction, "earlier");
assert.equal(at16.offer!.tripTime, "14:30"); // 17:30 − 60 min buffer − 115 min drive, to the quarter hour
console.log("16:00 → offer", at16.offer);

// 10:00 is too early (would wait > 3h at Dublin) → offer a later time.
const at10 = run(req("10:00"));
assert.equal(at10.reason, "EMPTY_RUN_OFFER_OTHER_TIME");
assert.equal(at10.offer!.direction, "later");
console.log("10:00 → offer", at10.offer);

// Wrong direction, return journeys, other days, far-away pickups, other diary → no discount.
assert.equal(run(req("14:00", { pickupLabel: "Dublin Airport", dropoffLabel: "Belfast", pickup: DUBLIN_AIRPORT, dropoff: BELFAST_CITY, fromAirport: true })).reason, "EMPTY_RUN_NO_MATCH");
assert.equal(run(req("14:00", { returnJourney: true })).reason, "EMPTY_RUN_RETURN_JOURNEY");
assert.equal(run(req("14:00", { tripDate: "2026-11-16" })).reason, "EMPTY_RUN_NO_MATCH");
assert.equal(run(req("14:00", { pickupLabel: "Derry", pickup: { lat: 54.9966, lng: -7.3086 } })).reason, "EMPTY_RUN_NO_MATCH");
assert.equal(run(req("14:00", { vehicle: "Executive Saloon (1–4 passengers)" })).reason, "EMPTY_RUN_NO_MATCH");
// Cancelled parent → no discount.
assert.equal(run(req("14:00"), on, [{ ...sundayDublinPickup, cancelled: true }]).reason, "EMPTY_RUN_NO_MATCH");
// Cheap fare already at/below the floor → no discount.
assert.equal(evaluateEmptyRunDiscount({ request: req("14:00"), fare: { amountGbp: 180, journeyFareGbp: 170, airportFixedCostsGbp: 10, nightWeekendSurchargeGbp: 0 }, occupied: [sundayDublinPickup], base: BASE, settings: on, now: NOW }).reason, "EMPTY_RUN_AT_FLOOR");
// Dublin city drop near the airport still counts (within 10 road miles).
assert.equal(run(req("14:00", { dropoffLabel: "Swords", dropoff: { lat: 53.4597, lng: -6.2181 }, airportCode: null })).applied, true);

// With the real Smart Availability engine: only bookable times are discounted or offered.
const bookable = (r: EmptyRunRequest) => (tripDate: string, tripTime: string) =>
  evaluateSmartAvailability({
    requested: { ...r, tripDate, tripTime } as never,
    occupied: [sundayDublinPickup],
    config: DEFAULT_SMART_OPS_CONFIG,
    now: NOW,
  }).available;
const withAvail = (r: EmptyRunRequest) =>
  evaluateEmptyRunDiscount({ request: r, fare, occupied: [sundayDublinPickup], base: BASE, settings: on, now: NOW, isTimeAvailable: bookable(r) });
assert.equal(withAvail(req("14:00")).applied, true);
const real16 = withAvail(req("16:00"));
assert.equal(real16.reason, "EMPTY_RUN_OFFER_OTHER_TIME");
assert.ok(bookable(req("16:00"))(real16.offer!.tripDate, real16.offer!.tripTime), "offered time must be bookable");
console.log("16:00 with Smart Availability → offer", real16.offer);
const real10 = withAvail(req("10:00"));
assert.equal(real10.offer!.direction, "later");
console.log("10:00 with Smart Availability → offer", real10.offer);

// Airport to airport: George Best Belfast City → Dublin Airport counts.
const BHD = { lat: 54.6181, lng: -5.8725 };
assert.equal(run(req("14:00", { pickupLabel: "George Best Belfast City Airport", pickup: BHD })).applied, true);
// Belfast International too.
assert.equal(run(req("14:00", { pickupLabel: "Belfast International Airport", pickup: { lat: 54.6575, lng: -6.2158 } })).applied, true);

console.log("empty-run pricing: all checks passed");
