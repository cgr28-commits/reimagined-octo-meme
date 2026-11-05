/**
 * Quote links: changing pickup/destination must invalidate the old fare and
 * clear any unpaid checkout before payment.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseQuickQuoteRouteAmendment,
  quickQuoteRouteChanged,
} from "../workers/addresses/src/quick-quote-handlers";
import type { QuickQuoteJourney } from "../shared/quick-quote";

async function main() {
  const journey: QuickQuoteJourney = {
    pickupAddress: "Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK",
    dropoffAddress: "15 Hope Street, Belfast BT12 5AH, UK",
    airportCode: "BFS",
    fromAirport: true,
    returnJourney: false,
    outboundDate: "2026-11-20",
    outboundTime: "09:00",
    passengers: 2,
    suitcases: 2,
  };

  assert.equal(
    quickQuoteRouteChanged(journey, {
      pickupAddress: journey.pickupAddress,
      dropoffAddress: journey.dropoffAddress,
    }),
    false,
  );
  assert.equal(
    quickQuoteRouteChanged(journey, {
      pickupAddress: journey.pickupAddress,
      dropoffAddress: "Fitzwilliam Hotel Belfast, 15 Hope Street, Belfast BT12 5AH, UK",
    }),
    true,
  );

  const ok = parseQuickQuoteRouteAmendment({
    pickupAddress: "Dublin Airport",
    dropoffAddress: "Bangor, County Down",
    pickupPlaceId: "ChIJtestPickup",
  });
  assert.ok(!("error" in ok));
  if (!("error" in ok)) {
    assert.equal(ok.pickupPlaceId, "ChIJtestPickup");
    assert.equal(ok.dropoffAddress, "Bangor, County Down");
  }

  assert.ok("error" in parseQuickQuoteRouteAmendment({ pickupAddress: "A", dropoffAddress: "Bangor" }));
  assert.ok(
    "error" in
      parseQuickQuoteRouteAmendment({
        pickupAddress: "Same Place",
        dropoffAddress: "same place",
      }),
  );

  const handler = readFileSync("workers/addresses/src/quick-quote-handlers.ts", "utf8");
  assert.match(handler, /export async function rerouteQuickQuote/);
  assert.match(handler, /priceSource: "website-pricing-engine"/);
  assert.match(handler, /checkoutId: undefined/);
  assert.match(handler, /handlePublicQuickQuoteReroute/);
  assert.match(handler, /refreshVoiceQuoteMemoAfterReroute/);

  const index = readFileSync("workers/addresses/src/index.ts", "utf8");
  assert.match(index, /\/quick-quotes\/reroute/);
  assert.match(index, /quick_quote_reroute_required/);
  assert.match(index, /handlePublicQuickQuoteReroute/);

  const api = readFileSync("src/lib/quick-quote-api.ts", "utf8");
  assert.match(api, /rerouteQuickQuote/);
  assert.match(api, /\/quick-quotes\/reroute/);

  const ui = readFileSync("src/app/book-quote/BookQuoteCustomerClient.tsx", "utf8");
  assert.match(ui, /AddressInput/);
  assert.match(ui, /rerouteQuickQuote/);
  assert.match(ui, /beginEditAddress/);
  assert.match(ui, /PLACES_LOOKUP_A2A/);
  assert.match(ui, /finish choosing the new address/);

  console.log("All quote-link reroute checks passed.");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
