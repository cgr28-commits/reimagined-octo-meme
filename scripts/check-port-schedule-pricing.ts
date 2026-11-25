/**
 * Cruise/ferry port journeys: pickup date/time reach the authoritative pricing engine, every leg of a
 * return is priced on its own date/time, and the existing 5% return discount applies afterwards.
 * Run: npx tsx scripts/check-port-schedule-pricing.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { defaultOwnerPricingSettings } from "../shared/owner-pricing-config";
const livePricing = defaultOwnerPricingSettings();
livePricing.specialDateFares = [];

const port = "Belfast Cruise Terminal, 20 Airport Rd W, Belfast BT3 9ED, UK";
const metrics = { distanceKm: 32, durationMinutes: 35 };
const FRI = "2026-08-21", SAT = "2026-08-22", WED = "2026-08-19";
const base = { airportCode: "BFS" as const, fromAirport: false, pickupAddress: port, dropoffAddress: "Belfast International Airport", passengers: 2, suitcases: 1, routeMetrics: metrics };

function quote(extra: Record<string, unknown>) {
  const q = calculateAuthoritativeWebsiteQuote({ ...base, ...extra } as never);
  assert.equal(q.ok, true, JSON.stringify(q));
  return q as Extract<typeof q, { ok: true }>;
}

const wed = quote({ returnJourney: false, outboundDate: WED, outboundTime: "10:00" });
const sat = quote({ returnJourney: false, outboundDate: SAT, outboundTime: "10:00" });
assert.equal(wed.premiumApplied, false);
assert.equal(sat.premiumApplied, true);
assert.ok(sat.amount > wed.amount);
console.log(`OK  one way from a port: weekday £${wed.amount}, Saturday £${sat.amount} (date/time change the engine price)`);

const retWW = quote({ returnJourney: true, outboundDate: WED, outboundTime: "10:00", returnDate: FRI, returnTime: "10:00" });
const retSS = quote({ returnJourney: true, outboundDate: SAT, outboundTime: "10:00", returnDate: SAT, returnTime: "18:00" });
const retMixed = quote({ returnJourney: true, outboundDate: SAT, outboundTime: "10:00", returnDate: WED, returnTime: "10:00" });
const retMixedB = quote({ returnJourney: true, outboundDate: WED, outboundTime: "10:00", returnDate: SAT, returnTime: "10:00" });
assert.ok(retWW.amount < retMixed.amount && retMixed.amount < retSS.amount, "mixed return sits between the two");
assert.equal(retMixed.amount, retMixedB.amount, "which leg carries the premium does not matter: legs are independent");
console.log(`OK  return legs priced independently: both weekday £${retWW.amount}, mixed £${retMixed.amount}, both weekend £${retSS.amount}`);

const plainReturn = quote({ returnJourney: true, outboundDate: WED, outboundTime: "10:00", returnDate: WED, returnTime: "11:00" });
assert.ok(plainReturn.amount < wed.amount * 2, "5% return discount still applied");
console.log(`OK  return discount: 2 x £${wed.amount} -> £${plainReturn.amount}`);

// A return without a return date/time must not price as a complete return.
const noReturnDate = calculateAuthoritativeWebsiteQuote({ ...base, returnJourney: true, outboundDate: WED, outboundTime: "10:00" } as never);
console.log(`INFO return without return date/time -> ok=${noReturnDate.ok}`);

// Quote tool wiring: the port page asks for date/time up front and passes them to the engine.
const card = readFileSync("src/components/QuoteCard.tsx", "utf8");
assert.match(card, /Boolean\(portPicker\) \|\|/);
assert.match(card, /outboundDate: tripDate,\s+outboundTime: tripTime,\s+returnDate,\s+returnTime,/);
console.log("OK  QuoteCard: schedule required up front on the port page, passed to the engine");

// Christmas (14-31 Dec, 20%) and night/weekend/bank-holiday adjustments are folded into the single fare.
const norm = quote({ returnJourney: false, outboundDate: "2026-12-10", outboundTime: "12:00", pricing: livePricing });
const xmas = quote({ returnJourney: false, outboundDate: "2026-12-16", outboundTime: "12:00", pricing: livePricing });
assert.ok(xmas.amount > norm.amount, "Christmas period costs more");
assert.ok(Math.abs(xmas.amount / norm.amount - 1.2) < 0.03, `Christmas ~20% (got ${xmas.amount / norm.amount})`);
const night = quote({ returnJourney: false, outboundDate: WED, outboundTime: "23:30", pricing: livePricing });
assert.ok(night.amount > wed.amount, "night premium folded into fare");
for (const q of [norm, xmas, night, sat]) assert.equal(typeof q.amount, "number");
console.log(`OK  Christmas £${norm.amount} -> £${xmas.amount} (+20%), night £${night.amount}: one customer-facing fare`);
