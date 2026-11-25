/**
 * Contracts for the cruise & ferry port catalogue, settings and guards.
 * Run: npx tsx scripts/check-ports.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_PORTS,
  MAX_CUSTOM_PORTS,
  activePorts,
  defaultPortSettings,
  isPortPlaceId,
  normalizePortSettings,
  portHasVerifiedLocation,
  portTileLabel,
  portRouteConflict,
  resolvePorts,
  toPublicPorts,
} from "../shared/ports";
import { portPairConflict, portToPlace } from "../src/lib/port-places";

const defaults = resolvePorts(undefined);
const active = activePorts(defaults);
const ids = new Set(defaults.map((p) => p.id));
assert.equal(ids.size, defaults.length, "unique port ids");
assert.equal(new Set(defaults.map((p) => p.placeId)).size, defaults.length, "unique place ids");

// Excluded until officially confirmed.
for (const banned of ["greencastle", "isle-of-man", "steam-packet"]) {
  assert.ok(!defaults.some((p) => p.id.includes(banned)), `${banned} must not be catalogued`);
}
console.log("OK  catalogue ids unique, excluded ports absent");

// A port can only be active with a verified location.
for (const p of active) assert.ok(portHasVerifiedLocation(p), `${p.id} active without location`);
for (const id of [
  "belfast-cruise-terminal",
  "stena-belfast-cairnryan-vt4",
  "stena-belfast-liverpool-vt2",
  "irish-ferries-dublin-t1",
  "stena-dublin-t2",
]) {
  assert.ok(active.some((p) => p.id === id), `${id} should be active by default`);
}
for (const id of [
  "po-larne-cairnryan",
  "warrenpoint-port",
  "foyle-port-lisahally",
  "fort-george-derry",
  "bangor-harbour",
  "dublin-cruise-port",
  "dun-laoghaire-harbour",
]) {
  assert.ok(!active.some((p) => p.id === id), `${id} must stay inactive by default`);
}
console.log("OK  default active / inactive sets");

// Two Stena Belfast terminals cannot be confused.
const vt2 = defaults.find((p) => p.id === "stena-belfast-liverpool-vt2")!;
const vt4 = defaults.find((p) => p.id === "stena-belfast-cairnryan-vt4")!;
assert.notEqual(vt2.name, vt4.name);
assert.notEqual(vt2.placeId, vt4.placeId);
console.log("OK  Stena VT2 / VT4 distinct");

// Owner cannot force-activate a port with no verified location.
const forced = resolvePorts(
  normalizePortSettings({ overrides: { "po-larne-cairnryan": { active: true, lat: null, lng: null } } }),
);
const larne = forced.find((p) => p.id === "po-larne-cairnryan")!;
assert.ok(!activePorts(forced).includes(larne) || portHasVerifiedLocation(larne));
console.log("OK  unverified port cannot be activated");

// Garbage settings normalise safely and custom ports are capped.
assert.deepEqual(normalizePortSettings(null), defaultPortSettings());
const many = normalizePortSettings({
  custom: Array.from({ length: MAX_CUSTOM_PORTS + 10 }, (_, i) => ({
    id: `custom-${i}`, name: `P${i}`, region: "NI", kind: "ferry",
  })),
});
assert.ok(many.custom.length <= MAX_CUSTOM_PORTS);
console.log("OK  settings normalisation and custom port cap");

// Public projection never leaks owner-only notes.
for (const p of toPublicPorts(defaults)) {
  assert.ok(!("note" in p), "public port must not include owner note");
}
console.log("OK  public ports hide owner notes");

// Synthetic place ids and place objects.
const dub = defaults.find((p) => p.id === "stena-dublin-t2")!;
assert.ok(isPortPlaceId(dub.placeId) || dub.placeId.length > 0);
const dubPlace = portToPlace(toPublicPorts([dub])[0]);
assert.equal(dubPlace.countryCode, "IE");

// Dublin ports: Northern Ireland journeys only.
assert.ok(portRouteConflict({ portRegion: "DUBLIN", otherCountryCode: "IE" }));
assert.ok(portRouteConflict({ portRegion: "DUBLIN", otherCountryCode: "GB" }) === null);
assert.ok(portRouteConflict({ portRegion: "NI", otherCountryCode: "IE" }) === null);
const belfast = portToPlace(toPublicPorts([defaults.find((p) => p.id === "belfast-cruise-terminal")!])[0]);
assert.equal(belfast.countryCode, "GB");
assert.equal(portPairConflict(dubPlace, belfast, toPublicPorts(defaults)), "");
assert.ok(portPairConflict(dubPlace, { ...belfast, countryCode: "IE" }, toPublicPorts(defaults)));
console.log("OK  Dublin ports limited to Northern Ireland journeys");

// Sailing details reach every downstream layer.
const read = (p: string) => readFileSync(p, "utf8");
for (const [file, needle] of [
  ["shared/booking-notifications.ts", "Cruise ship / ferry"],
  ["shared/driver-job-sanitize.ts", "sailingDetails"],
  ["shared/paid-booking-record.ts", "sailingDetails"],
  ["workers/addresses/src/index.ts", "sailingDetails"],
  ["workers/addresses/src/driver-jobs-wiring.ts", "Cruise ship / ferry"],
  ["workers/addresses/src/google-calendar.ts", "Cruise ship / ferry"],
  ["src/components/OwnerPaidBookingsPanel.tsx", "Cruise ship / ferry"],
  ["src/app/book-quote/BookQuoteCustomerClient.tsx", "book-quote-sailing-details"],
] as const) {
  assert.ok(read(file).includes(needle), `${file} missing ${needle}`);
}
// Owner-approved short tile labels.
const labels: Record<string, string> = {
  "belfast-cruise-terminal": "Belfast Cruise",
  "stena-belfast-cairnryan-vt4": "Stena Belfast VT4 — Cairnryan",
  "stena-belfast-liverpool-vt2": "Stena Belfast VT2 — Liverpool",
  "po-larne-cairnryan": "P&O Larne — Cairnryan",
  "irish-ferries-dublin-t1": "Irish Ferries T1 — Dublin",
  "stena-dublin-t2": "Stena Line T2 — Dublin",
};
for (const [id, label] of Object.entries(labels)) {
  assert.equal(portTileLabel(defaults.find((p) => p.id === id)!), label, id);
}
console.log("OK  short tile labels");

// Long pickup instructions stay out of the quote tool; they live at booking details + confirmations.
assert.ok(!read("src/components/PortPicker.tsx").includes("pickupInstructions"));
assert.ok(read("src/app/book-quote/BookQuoteCustomerClient.tsx").includes("data-port-pickup-note"));
for (const f of ["shared/booking-notifications.ts", "workers/addresses/src/driver-jobs-wiring.ts", "workers/addresses/src/google-calendar.ts"]) {
  assert.ok(read(f).includes("Pickup point"), `${f} missing Pickup point`);
}
console.log("OK  pickup instructions moved to booking details, confirmations, driver");

// Sailing details must never gate the instant quote.
assert.ok(!read("src/components/QuoteCard.tsx").includes("sailingDetails"));
console.log("OK  sailing details wired end to end, not required before the quote");
console.log("\nAll port checks passed");
