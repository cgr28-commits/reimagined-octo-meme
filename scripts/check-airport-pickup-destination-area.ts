/**
 * BFS / BHD / DUB airport-pickup destination eligibility.
 * Instant quotes only when the non-airport end is Greater Belfast.
 * Out-of-area destinations use Request Fixed Quote — not a hard reject.
 *
 * Run: npx tsx scripts/check-airport-pickup-destination-area.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GREATER_BELFAST_GEOFENCE,
  GREATER_BELFAST_POSTCODE_DISTRICTS,
} from "../shared/ldy-service-area";
import {
  isClearlyOutsideApprovedAirportPickupDestination,
  quoteLeadAirportPickupRequiresManualApproval,
} from "../shared/airport-pickup-service-area";
import {
  createSerializedQuoteLeadMarkerStore,
  isCompleteFixedPriceQuote,
  runQuoteLeadNotification,
  sanitizeQuoteLeadAutomaticPrice,
  type QuoteLeadDetails,
} from "../shared/quote-lead";
import { calculateQuote } from "../src/lib/quote";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import {
  airportPickupDestinationNeedsManualQuote,
  needsManualQuoteApproval,
  quickSelectToPlace,
  selectedPlaceFromParts,
  type SelectedPlace,
} from "../src/lib/selected-place";

const SALOON = "Standard Saloon (1–4 passengers)" as const;
const METRICS = { distanceKm: 150, durationMinutes: 120 };

function place(
  partial: Partial<SelectedPlace> & Pick<SelectedPlace, "formattedAddress" | "placeId">,
): SelectedPlace {
  return selectedPlaceFromParts({
    placeId: partial.placeId,
    formattedAddress: partial.formattedAddress,
    displayAddress: partial.displayAddress ?? partial.formattedAddress,
    placeName: partial.placeName,
    lat: partial.lat ?? null,
    lng: partial.lng ?? null,
    countryCode: partial.countryCode ?? "GB",
    postalCode: partial.postalCode ?? null,
    streetNumber: partial.streetNumber ?? null,
    route: partial.route ?? null,
    locality: partial.locality ?? null,
    administrativeArea: partial.administrativeArea ?? null,
  });
}

function check(label: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => {
    console.log(`OK  ${label}`);
  });
}

const dub = quickSelectToPlace("DUB")!;
const bfs = quickSelectToPlace("BFS")!;
const bhd = quickSelectToPlace("BHD")!;
const ldy = quickSelectToPlace("LDY")!;
assert.ok(dub && bfs && bhd && ldy);

const belfast = place({
  placeId: "belfast-city-hall",
  formattedAddress: "10 Donegall Square North, Belfast BT1 5GB, UK",
  placeName: "Belfast City Hall",
  postalCode: "BT1 5GB",
  streetNumber: "10",
  lat: 54.5973,
  lng: -5.9301,
  locality: "Belfast",
});

const newtownabbey = place({
  placeId: "newtownabbey",
  formattedAddress: "7 Glen Manor Road, Newtownabbey BT36 5XX, UK",
  postalCode: "BT36 5XX",
  streetNumber: "7",
  lat: 54.69,
  lng: -5.93,
  locality: "Newtownabbey",
});

const lisburn = place({
  placeId: "lisburn",
  formattedAddress: "2 Market Square, Lisburn BT28 1AG, UK",
  postalCode: "BT28 1AG",
  streetNumber: "2",
  lat: 54.511,
  lng: -6.043,
  locality: "Lisburn",
});

const bangor = place({
  placeId: "bangor",
  formattedAddress: "12 Main Street, Bangor BT20 5AF, UK",
  postalCode: "BT20 5AF",
  streetNumber: "12",
  lat: 54.663,
  lng: -5.668,
  locality: "Bangor",
});

const dungannon = place({
  placeId: "dungannon-bt71",
  formattedAddress: "18 Line of Road, Coalisland, Dungannon BT71 4FJ, UK",
  postalCode: "BT71 4FJ",
  streetNumber: "18",
  lat: 54.541,
  lng: -6.701,
  locality: "Coalisland",
});

const newry = place({
  placeId: "newry",
  formattedAddress: "12 Hill Street, Newry BT34 1AR, UK",
  postalCode: "BT34 1AR",
  streetNumber: "12",
  lat: 54.175,
  lng: -6.34,
  locality: "Newry",
});

const omagh = place({
  placeId: "omagh",
  formattedAddress: "1 High Street, Omagh BT78 1AB, UK",
  postalCode: "BT78 1AB",
  streetNumber: "1",
  lat: 54.5977,
  lng: -7.3101,
  locality: "Omagh",
});

const enniskillen = place({
  placeId: "enniskillen",
  formattedAddress: "1 Townhall Street, Enniskillen BT74 7BA, UK",
  postalCode: "BT74 7BA",
  streetNumber: "1",
  lat: 54.344,
  lng: -7.631,
  locality: "Enniskillen",
});

const cork = place({
  placeId: "cork",
  formattedAddress: "Patrick Street, Cork, T12 P8RP, Ireland",
  postalCode: "T12 P8RP",
  streetNumber: null,
  placeName: "Patrick Street",
  lat: 51.8985,
  lng: -8.4756,
  countryCode: "IE",
  locality: "Cork",
});

function assertInstant(pickup: SelectedPlace, dropoff: SelectedPlace, label: string) {
  assert.equal(
    needsManualQuoteApproval(pickup, dropoff),
    false,
    `${label} must stay an instant quote`,
  );
}

function assertManual(pickup: SelectedPlace, dropoff: SelectedPlace, label: string) {
  assert.equal(
    needsManualQuoteApproval(pickup, dropoff),
    true,
    `${label} must use Request Fixed Quote`,
  );
  if (pickup === dub || pickup === bfs || pickup === bhd) {
    assert.equal(airportPickupDestinationNeedsManualQuote(pickup, dropoff), true, label);
  }
}

function quoteLead(partial: Partial<QuoteLeadDetails> & Pick<QuoteLeadDetails, "pickupLabel" | "dropoffLabel" | "tripLabel">): QuoteLeadDetails {
  return {
    returnJourney: false,
    passengers: 2,
    suitcases: 1,
    vehicle: SALOON,
    estimatedPrice: "£204.00",
    isAirportTrip: true,
    totalGbp: 204,
    source: "website",
    quoteTransactionId: "quote_test_airport_pickup",
    ...partial,
  };
}

async function main() {
  await check("Greater Belfast definition is unchanged", () => {
    assert.equal(GREATER_BELFAST_GEOFENCE.minLat, 54.45);
    assert.equal(GREATER_BELFAST_GEOFENCE.maxLat, 54.78);
    assert.equal(GREATER_BELFAST_GEOFENCE.minLng, -6.35);
    assert.equal(GREATER_BELFAST_GEOFENCE.maxLng, -5.55);
    assert.equal(GREATER_BELFAST_POSTCODE_DISTRICTS.has("BT1"), true);
    assert.equal(GREATER_BELFAST_POSTCODE_DISTRICTS.has("BT20"), true);
    assert.equal(GREATER_BELFAST_POSTCODE_DISTRICTS.has("BT36"), true);
    assert.equal(GREATER_BELFAST_POSTCODE_DISTRICTS.has("BT43"), true);
    assert.equal(GREATER_BELFAST_POSTCODE_DISTRICTS.has("BT71"), false);
    assert.equal(GREATER_BELFAST_POSTCODE_DISTRICTS.has("BT34"), false);
    assert.equal(GREATER_BELFAST_POSTCODE_DISTRICTS.has("BT78"), false);
    assert.equal(GREATER_BELFAST_POSTCODE_DISTRICTS.has("BT74"), false);
    const source = readFileSync(join(process.cwd(), "shared/ldy-service-area.ts"), "utf8");
    assert.match(source, /BT1–BT20, BT22, BT23, BT26–BT29, BT36–BT43/);
  });

  console.log("\n=== Instant both directions (Greater Belfast) ===\n");

  for (const [name, dest] of [
    ["Belfast", belfast],
    ["Newtownabbey", newtownabbey],
    ["Lisburn", lisburn],
    ["Bangor", bangor],
  ] as const) {
    await check(`${name} → DUB instant`, () => assertInstant(dest, dub, `${name} → DUB`));
    await check(`DUB → ${name} instant`, () => assertInstant(dub, dest, `DUB → ${name}`));
    await check(`${name} → BFS instant`, () => assertInstant(dest, bfs, `${name} → BFS`));
    await check(`BFS → ${name} instant`, () => assertInstant(bfs, dest, `BFS → ${name}`));
    await check(`${name} → BHD instant`, () => assertInstant(dest, bhd, `${name} → BHD`));
    await check(`BHD → ${name} instant`, () => assertInstant(bhd, dest, `BHD → ${name}`));
  }

  console.log("\n=== Manual both directions (out of area) ===\n");

  for (const [name, dest] of [
    ["Dungannon/BT71", dungannon],
    ["Newry", newry],
    ["Omagh", omagh],
    ["Enniskillen", enniskillen],
  ] as const) {
    await check(`${name} → DUB manual`, () => assertManual(dest, dub, `${name} → DUB`));
    await check(`DUB → ${name} manual`, () => assertManual(dub, dest, `DUB → ${name}`));
    await check(`BFS → ${name} manual`, () => assertManual(bfs, dest, `BFS → ${name}`));
    await check(`BHD → ${name} manual`, () => assertManual(bhd, dest, `BHD → ${name}`));
  }

  await check("Out-of-area origin → BFS/BHD stays on existing instant rule", () => {
    // Existing: NI pickup outside GB + BFS/BHD destination unlocks a live quote.
    assertInstant(newry, bfs, "Newry → BFS");
    assertInstant(newry, bhd, "Newry → BHD");
    assertInstant(omagh, bfs, "Omagh → BFS");
    assertManual(newry, dub, "Newry → DUB");
    assertManual(omagh, dub, "Omagh → DUB");
  });

  await check("BFS/BHD ↔ Cork ROI corridor stays instant", () => {
    assertInstant(bfs, cork, "BFS → Cork");
    assertInstant(cork, bfs, "Cork → BFS");
    assertInstant(bhd, cork, "BHD → Cork");
    assertInstant(cork, bhd, "Cork → BHD");
    assert.equal(needsManualQuoteApproval(dub, cork), true);
  });

  await check("LDY behaviour is unchanged", () => {
    assert.equal(needsManualQuoteApproval(ldy, belfast), false);
    assert.equal(needsManualQuoteApproval(belfast, ldy), false);
    assert.equal(
      calculateQuote(dungannon.formattedAddress, "LDY", SALOON, false, {}, METRICS, true),
      null,
    );
    assert.ok(calculateQuote(belfast.formattedAddress, "LDY", SALOON, false, {}, METRICS, true));
  });

  console.log("\n=== Pricing engine untouched; public service refuses auto fare ===\n");

  await check("calculateQuote still prices DUB → BT71 (curve unchanged)", () => {
    const priced = calculateQuote(dungannon.formattedAddress, "DUB", SALOON, false, {}, METRICS, true);
    assert.ok(priced && priced.amount > 0, "pricing engine must still compute a number");
  });

  await check("Public quote service does not return a bookable DUB → BT71 fare", () => {
    const blocked = calculateAuthoritativeWebsiteQuote({
      airportCode: "DUB",
      fromAirport: true,
      pickupAddress: dub.formattedAddress,
      dropoffAddress: dungannon.formattedAddress,
      returnJourney: false,
      passengers: 2,
      suitcases: 1,
      destinationLat: dungannon.lat,
      destinationLng: dungannon.lng,
      destinationPostalCode: dungannon.postalCode,
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.reason, "unsupported");
      assert.match(blocked.message, /fixed quote|Greater Belfast/i);
    }
  });

  await check("Public quote service still prices Belfast → DUB", () => {
    const allowed = calculateAuthoritativeWebsiteQuote({
      airportCode: "DUB",
      fromAirport: false,
      pickupAddress: belfast.formattedAddress,
      dropoffAddress: dub.formattedAddress,
      returnJourney: false,
      passengers: 2,
      suitcases: 1,
      routeMetrics: METRICS,
    });
    assert.equal(allowed.ok, true);
  });

  await check("Owner/quick-quote can still compute a guide fare when enforcement is off", () => {
    const owner = calculateAuthoritativeWebsiteQuote({
      airportCode: "DUB",
      fromAirport: true,
      pickupAddress: dub.formattedAddress,
      dropoffAddress: dungannon.formattedAddress,
      returnJourney: false,
      passengers: 2,
      suitcases: 1,
      routeMetrics: METRICS,
      enforceAirportPickupServiceArea: false,
    });
    assert.equal(owner.ok, true);
  });

  console.log("\n=== Quote notification cannot report an automatic £ ===\n");

  await check("DUB → BT71 quote-lead is not a complete fixed-price quote", () => {
    const details = quoteLead({
      tripLabel: "Airport pickup",
      pickupLabel: "Dublin Airport, Co. Dublin, Ireland",
      dropoffLabel: dungannon.formattedAddress,
      airportCode: "DUB",
    });
    assert.equal(quoteLeadAirportPickupRequiresManualApproval(details), true);
    assert.equal(isClearlyOutsideApprovedAirportPickupDestination(dungannon.formattedAddress), true);
    assert.equal(isCompleteFixedPriceQuote(details), false);
    const sanitized = sanitizeQuoteLeadAutomaticPrice(details);
    assert.equal(sanitized.estimatedPrice, "Request fixed quote");
    assert.equal(sanitized.totalGbp, undefined);
  });

  await check("DUB → Belfast quote-lead still counts as a complete fixed price", () => {
    const details = quoteLead({
      tripLabel: "Airport pickup",
      pickupLabel: "Dublin Airport, Co. Dublin, Ireland",
      dropoffLabel: belfast.formattedAddress,
      airportCode: "DUB",
    });
    assert.equal(quoteLeadAirportPickupRequiresManualApproval(details), false);
    assert.equal(isCompleteFixedPriceQuote(details), true);
  });

  await check("Belfast → DUB quote-lead is unchanged (airport drop-off)", () => {
    const details = quoteLead({
      tripLabel: "Airport drop-off",
      pickupLabel: belfast.formattedAddress,
      dropoffLabel: "Dublin Airport, Co. Dublin, Ireland",
      airportCode: "DUB",
    });
    assert.equal(quoteLeadAirportPickupRequiresManualApproval(details), false);
    assert.equal(isCompleteFixedPriceQuote(details), true);
  });

  await check("Owner email is not sent for DUB → Newry with a leaked £204", async () => {
    const sent: string[] = [];
    const result = await runQuoteLeadNotification({
      details: quoteLead({
        tripLabel: "Airport pickup",
        pickupLabel: "Dublin Airport",
        dropoffLabel: newry.formattedAddress,
        airportCode: "DUB",
        estimatedPrice: "£204.00",
        totalGbp: 204,
      }),
      kind: "quote",
      store: createSerializedQuoteLeadMarkerStore(),
      sendEmail: async (subject, body) => {
        sent.push(`${subject}\n${body}`);
        return true;
      },
    });
    assert.equal(result.emailed, false);
    assert.equal(result.quoteEmailed, false);
    assert.equal(sent.length, 0);
  });

  await check("Owner email still sends for DUB → Belfast", async () => {
    const sent: string[] = [];
    const result = await runQuoteLeadNotification({
      details: quoteLead({
        tripLabel: "Airport pickup",
        pickupLabel: "Dublin Airport, Co. Dublin, Ireland",
        dropoffLabel: belfast.formattedAddress,
        airportCode: "DUB",
        quoteTransactionId: "quote_ok_belfast",
      }),
      kind: "quote",
      store: createSerializedQuoteLeadMarkerStore(),
      sendEmail: async (subject) => {
        sent.push(subject);
        return true;
      },
    });
    assert.equal(result.quoteEmailed, true);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /£204/);
  });

  console.log("\nAll airport-pickup destination-area checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
