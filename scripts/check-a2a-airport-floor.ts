/**
 * Long A2A fares must not undercut BFS/BHD airport fares to the same remote town.
 * Run: npx tsx scripts/check-a2a-airport-floor.ts
 */

import assert from "node:assert/strict";
import {
  calculatePointToPointQuote,
  calculateQuote,
  getBelfastAirportFareFloorForArea,
} from "../src/lib/quote";

const SALOON = "Standard Saloon (1–4 passengers)" as const;
const ESTATE = "Estate Car (1–4 passengers)" as const;

const cultra = "Cultra Station Road, Holywood, BT18 0EX";
const belfast = "10 Donegall Square North, Belfast BT1 5GB";
const enniskillen = "10 East Bridge Street, Enniskillen, BT74 7AB";
const bangor = "1 Main Street, Bangor BT20 5AF";
const lisburn = "1 Market Square, Lisburn BT28 1XN";
const newry = "1 Marcus Square, Newry BT35 8DQ";

const bfsEnniSaloon = calculateQuote(enniskillen, "BFS", SALOON)?.amount;
const bfsEnniEstate = calculateQuote(enniskillen, "BFS", ESTATE)?.amount;
assert.ok(bfsEnniSaloon && bfsEnniEstate);
assert.equal(getBelfastAirportFareFloorForArea("Enniskillen", SALOON), bfsEnniSaloon);
assert.equal(getBelfastAirportFareFloorForArea("Enniskillen", ESTATE), bfsEnniEstate);

const cultraEnniMetrics = { distanceKm: 141.8, durationMinutes: 110 };
const cultraEnniSaloon = calculatePointToPointQuote(
  cultra,
  enniskillen,
  SALOON,
  false,
  {},
  cultraEnniMetrics,
);
const cultraEnniEstate = calculatePointToPointQuote(
  cultra,
  enniskillen,
  ESTATE,
  false,
  {},
  cultraEnniMetrics,
);
assert.ok(cultraEnniSaloon && cultraEnniEstate);
assert.ok(
  cultraEnniSaloon.amount >= bfsEnniSaloon,
  `Cultra→Enniskillen saloon £${cultraEnniSaloon.amount} must be >= BFS £${bfsEnniSaloon}`,
);
assert.ok(
  cultraEnniEstate.amount >= bfsEnniEstate,
  `Cultra→Enniskillen estate £${cultraEnniEstate.amount} must be >= BFS £${bfsEnniEstate}`,
);
console.log(
  `OK  Cultra→Enniskillen saloon £${cultraEnniSaloon.amount} / estate £${cultraEnniEstate.amount} (BFS floor £${bfsEnniSaloon}/£${bfsEnniEstate})`,
);

const belfastEnni = calculatePointToPointQuote(
  belfast,
  enniskillen,
  SALOON,
  false,
  {},
  { distanceKm: 130.2, durationMinutes: 98 },
);
assert.ok(belfastEnni);
assert.ok(
  belfastEnni.amount >= bfsEnniSaloon,
  `Belfast→Enniskillen saloon £${belfastEnni.amount} must be >= BFS £${bfsEnniSaloon}`,
);
console.log(`OK  Belfast→Enniskillen saloon £${belfastEnni.amount}`);

const fallback = calculatePointToPointQuote(cultra, enniskillen, SALOON);
assert.ok(fallback);
assert.ok(
  fallback.amount >= bfsEnniSaloon,
  `Fallback Cultra→Enniskillen £${fallback.amount} must be >= BFS £${bfsEnniSaloon}`,
);
console.log(`OK  Fallback (no map) Cultra→Enniskillen saloon £${fallback.amount}`);

// Short local A2A must not be pushed up to BFS→Bangor airport money.
const shortBangor = calculatePointToPointQuote(
  cultra,
  bangor,
  SALOON,
  false,
  {},
  { distanceKm: 11.9, durationMinutes: 15 },
);
assert.ok(shortBangor);
assert.ok(
  shortBangor.amount < 60,
  `Short Cultra→Bangor should stay local (got £${shortBangor.amount})`,
);
console.log(`OK  Short Cultra→Bangor saloon £${shortBangor.amount} (no airport floor)`);

const shortLisburn = calculatePointToPointQuote(
  belfast,
  lisburn,
  SALOON,
  false,
  {},
  { distanceKm: 15.5, durationMinutes: 15 },
);
assert.ok(shortLisburn);
assert.ok(shortLisburn.amount < 80, `Lisburn A2A should stay modest (got £${shortLisburn.amount})`);
console.log(`OK  Belfast→Lisburn saloon £${shortLisburn.amount}`);

const newryFloor = getBelfastAirportFareFloorForArea("Newry", SALOON);
const cultraNewry = calculatePointToPointQuote(
  cultra,
  newry,
  SALOON,
  false,
  {},
  { distanceKm: 71.5, durationMinutes: 58 },
);
assert.ok(cultraNewry);
assert.ok(
  cultraNewry.amount >= newryFloor,
  `Cultra→Newry £${cultraNewry.amount} must be >= airport floor £${newryFloor}`,
);
console.log(`OK  Cultra→Newry saloon £${cultraNewry.amount} (floor £${newryFloor})`);

console.log("\nAll A2A airport-floor checks passed.");
