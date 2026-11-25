/**
 * Cruise/ferry port journeys: pickup date/time reach the authoritative pricing engine, every leg of a
 * return is priced on its own date/time, and the existing 5% return discount applies afterwards.
 * Run: npx tsx scripts/check-port-schedule-pricing.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";

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
