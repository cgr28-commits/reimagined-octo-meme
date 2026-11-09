/**
 * Dublin Airport in address search shows exactly "Dublin Airport Terminal 1" and
 * "Dublin Airport Terminal 2", both priced as Dublin Airport. The picked terminal fills
 * pickup instructions only when neither the owner nor flight data has set one.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DUBLIN_TERMINAL_PLACE_IDS,
  dublinTerminalAddress,
  dublinTerminalFromPlaceId,
  isDublinAirportVariant,
  shapeDublinAirportSuggestions,
} from "../src/lib/dublin-terminal-suggestions";
import { getServedAirport, matchServedAirportCode } from "../shared/served-airports";
import { resolveRoutePointWithPlaceId } from "../shared/route-metrics-resolver";
import { isAirportPickupLabel } from "../shared/arrival-whatsapp";
import {
  activeLegDublinArrivalTerminal,
  chooseDublinArrivalTerminal,
  dublinTerminalFromAddress,
} from "../shared/dublin-arrival-terminal";

const dub = getServedAirport("DUB")!;
const p = (placeId: string, mainText: string, secondaryText: string) => ({
  placeId,
  mainText,
  secondaryText,
  description: `${mainText}, ${secondaryText}`,
});

// What staging search returned for "Dublin airport terminal" on 9 Nov 2026.
const google = [
  p(dub.placeId, "Dublin Airport", "Co. Dublin, Ireland"),
  p("g-t1", "Dublin Airport, Terminal 1 (DUB)", "Collinstown, County Dublin"),
  p("g-t2", "Dublin Airport, Terminal 2 (DUB)", "Corballis, County Dublin"),
  p("g-cafe", "Marqette at Terminal 1 Dublin Airport", "Collinstown, Swords, County Dublin"),
  p("g-t1b", "Terminal 1", "Collinstown, Swords, County Dublin"),
  p("g-t2b", "Terminal 2", "Swords, County Dublin"),
  p("g-park", "Dublin Airport Logistics Park", "County Dublin"),
  p("g-city", "Dublin", "Ireland"),
  p("g-zoo", "Dublin Zoo", "Phoenix park, Saint James, Dublin"),
];

const shaped = shapeDublinAirportSuggestions(google, true);
assert.deepEqual(
  shaped.map((item) => item.mainText),
  [
    "Dublin Airport Terminal 1",
    "Dublin Airport Terminal 2",
    "Dublin Airport Logistics Park",
    "Dublin",
    "Dublin Zoo",
  ],
);
assert.equal(shaped.filter((item) => /terminal/i.test(item.mainText)).length, 2);

// Other places and non-Dublin searches are untouched.
const belfast = [
  p("bfs", "Belfast International Airport", "Airport Rd, Aldergrove BT29 4AB, UK"),
  p("x", "Terminal Building", "Belfast BT3 9JH, UK"),
];
assert.deepEqual(shapeDublinAirportSuggestions(belfast, false), belfast);
assert.equal(isDublinAirportVariant(p("g-park", "Dublin Airport Logistics Park", "County Dublin")), false);
assert.equal(isDublinAirportVariant(p("g-city", "Dublin", "Ireland")), false);

// Choosing a terminal prices exactly as Dublin Airport did before.
for (const terminal of ["T1", "T2"] as const) {
  const label = dublinTerminalAddress(terminal);
  assert.equal(dublinTerminalFromPlaceId(DUBLIN_TERMINAL_PLACE_IDS[terminal]), terminal);
  assert.equal(matchServedAirportCode(label), "DUB");
  assert.equal(isAirportPickupLabel(label), true);
  const geocode = async () => {
    throw new Error("must not geocode a served airport");
  };
  const byPlace = await resolveRoutePointWithPlaceId({ address: label, placeId: dub.placeId, geocode } as never);
  const byText = await resolveRoutePointWithPlaceId({ address: label, placeId: "", geocode } as never);
  for (const result of [byPlace, byText]) {
    assert.equal(result.source, "served-airport");
    assert.deepEqual(result.point, { lat: dub.lat, lng: dub.lng });
  }
}

// The selected place keeps Dublin Airport's own place ID and coordinates.
const maps = readFileSync(join(process.cwd(), "src/lib/google-maps.ts"), "utf8");
assert.match(maps, /const dublinTerminal = dublinTerminalFromPlaceId\(placeId\);[\s\S]*placeId: dub\.placeId,[\s\S]*lat: dub\.lat,[\s\S]*lng: dub\.lng,/);
assert.match(maps, /shapeDublinAirportSuggestions\([^)]*\], dublinIntent\)|shapeDublinAirportSuggestions\(collapsed, dublinIntent\)/);

// Terminal from the address: owner and flight data always win; never guessed.
assert.equal(dublinTerminalFromAddress("Dublin Airport Terminal 2, Co. Dublin, Ireland"), "T2");
assert.equal(dublinTerminalFromAddress("Dublin Airport, Co. Dublin, Ireland"), null);
assert.equal(dublinTerminalFromAddress("Terminal 1 Hotel, Belfast"), null);
const t1 = "Dublin Airport Terminal 1, Co. Dublin, Ireland";
assert.equal(chooseDublinArrivalTerminal({ fromAddress: t1 }), "T1");
assert.equal(chooseDublinArrivalTerminal({ fromFlight: "T2", fromAddress: t1 }), "T2");
assert.equal(chooseDublinArrivalTerminal({ stored: "T2", source: "owner", fromAddress: t1 }), "T2");
assert.equal(chooseDublinArrivalTerminal({ stored: "T2", source: "flight", fromAddress: t1 }), "T2");
assert.equal(chooseDublinArrivalTerminal({ fromAddress: "Dublin Airport, Co. Dublin, Ireland" }), null);

// Owner dashboard: return leg picks up where the outbound dropped off.
assert.equal(activeLegDublinArrivalTerminal({ pickupLabel: t1, dropoffLabel: "Belfast" }), "T1");
assert.equal(
  activeLegDublinArrivalTerminal({
    returnJourney: true,
    outboundJourneyStatus: "completed",
    pickupLabel: "Belfast",
    dropoffLabel: "Dublin Airport Terminal 2, Co. Dublin, Ireland",
  }),
  "T2",
);
assert.equal(activeLegDublinArrivalTerminal({ dublinArrivalTerminal: "T2", pickupLabel: t1 }), "T2");

// Worker: the address terminal is a fallback and is never saved as flight data.
const resolver = readFileSync(join(process.cwd(), "workers/addresses/src/dublin-terminal-resolve.ts"), "utf8");
assert.match(resolver, /return resolved \?\? fromAddress;/);
assert.doesNotMatch(resolver, /dublinArrivalTerminal: fromAddress/);

// Worker copy of the shared file stays in sync.
assert.equal(
  readFileSync(join(process.cwd(), "shared/dublin-arrival-terminal.ts"), "utf8"),
  readFileSync(join(process.cwd(), "workers/addresses/shared/dublin-arrival-terminal.ts"), "utf8"),
);

console.log("check-dublin-terminal-search: ok");
