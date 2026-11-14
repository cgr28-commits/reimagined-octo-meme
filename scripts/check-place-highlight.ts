/**
 * Hub page headings: the place the page belongs to is shown in green.
 * Route pages highlight the destination (after " to "); the pickup stays white.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findPlaceHighlight } from "../src/components/PlaceHighlight";
import { AIRPORT_PAGES, TOWN_HUB_PAGES, TRANSFER_ROUTE_PAGES } from "../src/lib/location-pages";

const cut = (text: string, places: string[]) => {
  const r = findPlaceHighlight(text, places);
  return r ? text.slice(r[0], r[1]) : null;
};
const airportNames = (a: { name: string; shortName: string }) => [a.name, a.shortName, a.shortName.endsWith("Airport") ? a.shortName : `${a.shortName} Airport`];

assert.equal(cut("Belfast International Airport to Belfast Taxi", ["Belfast"]), "Belfast");
assert.deepEqual(findPlaceHighlight("Belfast International Airport to Belfast Taxi", ["Belfast"]), [33, 40], "destination, not the pickup");
assert.equal(cut("Belfast to Belfast International Airport Taxi", ["Belfast International Airport", "Belfast International"]), "Belfast International Airport");
assert.equal(cut("Nothing here", ["Lisburn"]), null);

for (const page of AIRPORT_PAGES) assert.ok(cut(page.title, airportNames(page)), `airport heading: ${page.title}`);
for (const page of TOWN_HUB_PAGES) assert.equal(cut(page.h1, [page.town.name]), page.town.name, `town heading: ${page.h1}`);
for (const page of TRANSFER_ROUTE_PAGES) {
  const toIndex = page.h1.indexOf(" to ");
  assert.ok(toIndex > 0, `route heading has "to": ${page.h1}`);
  const places = page.direction === "to-airport" ? airportNames(page.airport) : [page.town.name];
  const range = findPlaceHighlight(page.h1, places);
  assert.ok(range && range[0] > toIndex, `destination highlighted: ${page.h1}`);
  if (page.direction === "to-airport") {
    // Opened from an airport page, the heading is reversed and the town becomes the destination.
    const swapped = `${page.airport.name} to ${page.town.name} Taxi`;
    const r = findPlaceHighlight(swapped, [page.town.name]);
    assert.ok(r && r[0] > swapped.indexOf(" to "), `reversed heading: ${swapped}`);
  }
}

for (const file of ["src/app/airports/[slug]/page.tsx", "src/app/locations/[slug]/page.tsx", "src/app/transfers/[slug]/page.tsx"]) {
  assert.ok(readFileSync(file, "utf8").includes("<PlaceHighlight"), `${file} uses PlaceHighlight`);
}
console.log(`Place highlight checks passed (${AIRPORT_PAGES.length} airports, ${TOWN_HUB_PAGES.length} towns, ${TRANSFER_ROUTE_PAGES.length} routes).`);
