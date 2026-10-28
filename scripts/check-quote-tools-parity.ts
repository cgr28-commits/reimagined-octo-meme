/**
 * Quick Quotes and Personal Quotes price exactly like the public quote tool;
 * only the owner's discount differs. Personal quotes keep the customer's
 * journey (passengers, cases, vehicle, return) and re-price at checkout.
 *
 * Google geocoding and road routing are mocked; nothing is saved or charged.
 * Run: tsx scripts/check-quote-tools-parity.ts
 */

import assert from "node:assert/strict";
import {
  applyPersonalQuoteDiscount,
  parsePersonalQuoteDiscount,
  toPersonalQuotePublicSummary,
  type PersonalQuoteRecord,
} from "../shared/personal-quote";
import { mainQuoteRequestBody, priceWithMainQuoteTool } from "../workers/addresses/src/main-quote-pricing";
import { createPricedQuickQuote } from "../workers/addresses/src/quick-quote-handlers";
import { selectVehicleForParty } from "../src/lib/vehicle-selection";

/** 3 passengers + 3 cases needs the Estate (as on the public site). */
const PARTY_VEHICLE = selectVehicleForParty(3, 3);
import {
  handleOwnerCreatePersonalQuote,
  handleOwnerListPersonalQuotes,
  parsePersonalQuoteJourney,
  resolvePersonalQuoteForPayment,
} from "../workers/addresses/src/personal-quote-handlers";

// ---------- in-memory KV ----------
function memoryKv(): KVNamespace {
  const data = new Map<string, string>();
  return {
    async get(key: string, type?: unknown) {
      const value = data.get(key);
      if (value == null) return null;
      const wantJson = type === "json" || (typeof type === "object" && (type as { type?: string })?.type === "json");
      return wantJson ? JSON.parse(value) : value;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
    async list(options?: { prefix?: string }) {
      const keys = [...data.keys()]
        .filter((k) => !options?.prefix || k.startsWith(options.prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: "" };
    },
    async getWithMetadata(key: string) {
      return { value: data.get(key) ?? null, metadata: null };
    },
  } as unknown as KVNamespace;
}

// ---------- mocked geocoding + routing ----------
const PLACES: Record<string, { lat: number; lng: number }> = {
  glengormley: { lat: 54.6748, lng: -5.9564 },
  "belfast international": { lat: 54.6575, lng: -6.2158 },
  lisburn: { lat: 54.5162, lng: -6.058 },
};
function locate(text: string) {
  const lower = text.toLowerCase();
  const hit = Object.entries(PLACES).find(([name]) => lower.includes(name));
  return hit ? hit[1] : { lat: 54.6, lng: -5.93 };
}
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("places.googleapis.com")) {
    const body = JSON.parse(String(init?.body ?? "{}")) as { textQuery?: string; input?: string };
    const point = locate(body.textQuery ?? body.input ?? "");
    return new Response(
      JSON.stringify({ places: [{ location: { latitude: point.lat, longitude: point.lng }, formattedAddress: body.textQuery }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  if (url.includes("osrm") || url.includes("routing")) {
    // 13 road miles, 22 minutes for every leg.
    return new Response(JSON.stringify({ code: "Ok", routes: [{ distance: (13 / 0.621371) * 1000, duration: 22 * 60 }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response("not mocked", { status: 404 });
}) as typeof fetch;

const OWNER_KEY = "owner-test-key";
function ownerRequest(): Request {
  return new Request("https://internal.invalid/owner", { method: "POST", headers: { "X-Owner-Key": OWNER_KEY } });
}

async function main() {
  console.log("=== Discount maths ===");
  assert.deepEqual(applyPersonalQuoteDiscount(50, { discountType: "amount", discountValue: 5 }), {
    websiteTransferGbp: 50,
    discountGbp: 5,
    transferGbp: 45,
  });
  assert.equal(applyPersonalQuoteDiscount(50, { discountType: "percent", discountValue: 10 }).transferGbp, 45);
  assert.equal(applyPersonalQuoteDiscount(50, { discountType: "amount", discountValue: 0 }).transferGbp, 50);
  assert.equal(applyPersonalQuoteDiscount(50, { discountType: "amount", discountValue: 80 }).transferGbp, 1, "never below £1");
  assert.equal(applyPersonalQuoteDiscount(43.5, { discountType: "percent", discountValue: 15 }).discountGbp, 6.53);
  assert.equal(parsePersonalQuoteDiscount({ discountType: "percent", discountValue: 91 }).ok, false);
  assert.equal(parsePersonalQuoteDiscount({ discountType: "amount", discountValue: -1 }).ok, false);
  assert.deepEqual(parsePersonalQuoteDiscount({ discountType: "percent", discountValue: "12.5" }), {
    ok: true,
    discountType: "percent",
    discountValue: 12.5,
  });

  console.log("=== Journey validation ===");
  assert.equal(parsePersonalQuoteJourney({ passengers: 5, suitcases: 1, vehicle: "x" }).ok, false, "max 4 passengers");
  assert.equal(parsePersonalQuoteJourney({ passengers: 3, suitcases: -1, vehicle: "x" }).ok, false);
  const journey = parsePersonalQuoteJourney({
    passengers: 3,
    suitcases: 3,
    vehicle: "Standard Saloon (1–4 passengers)",
    returnJourney: false,
    tripDate: "2026-11-11",
    tripTime: "10:00",
  });
  assert.ok(journey.ok && journey.journey.passengers === 3 && journey.journey.suitcases === 3);

  const store = memoryKv();
  const env = {
    TRACKING_STORE: store,
    GOOGLE_PLACES_API_KEY: "test",
    OWNER_ACCESS_KEY: OWNER_KEY,
    SITE_ORIGIN: "https://www.myairporttaxini.co.uk",
  };
  const journeyBase = {
    pickupAddress: "1 Test Road, Glengormley, Newtownabbey BT36 7QZ, UK",
    dropoffAddress: "Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK",
    airportCode: "BFS",
    fromAirport: false,
    returnJourney: false,
    outboundDate: "2026-11-11",
    outboundTime: "10:00",
    passengers: 3,
    suitcases: 3,
  };

  console.log("=== Main quote tool price ===");
  const main3 = await priceWithMainQuoteTool(
    mainQuoteRequestBody({ ...journeyBase, vehicleType: PARTY_VEHICLE }),
    env,
  );
  assert.ok(main3.ok, `main tool priced: ${JSON.stringify(main3)}`);
  if (!main3.ok) return;
  console.log(`  Glengormley → BFS, 3 pax 3 cases: £${main3.amount}`);

  console.log("=== Quick Quote = main tool ===");
  const quick = await createPricedQuickQuote(
    {
      ...journeyBase,
      journeyMode: "one-way",
      vehicleChoice: "Saloon",
      priceSource: "website-pricing-engine",
      validityMode: "24h",
      expressDropOffSelected: false,
    },
    env,
    { createdByOwner: true, request: ownerRequest() },
  );
  assert.ok(quick.ok, `quick quote created: ${JSON.stringify(quick)}`);
  if (quick.ok) {
    const record = quick.record as unknown as Record<string, unknown>;
    const fare = Number(record.transferFareBeforeDiscount ?? record.calculatedFare ?? record.quotedAmount);
    assert.equal(fare, main3.amount, "quick quote transfer fare equals the main quote tool");
    const journeyRecord = record.journey as { passengers: number; suitcases: number };
    assert.equal(journeyRecord.passengers, 3, "quick quote keeps 3 passengers");
    assert.equal(journeyRecord.suitcases, 3, "quick quote keeps 3 suitcases");
  }

  console.log("=== Personal Quote: created from the main tool price, discount applied ===");
  const created = await handleOwnerCreatePersonalQuote(ownerRequest(), env, {
    customerName: "Test Customer",
    customerEmail: "test@example.com",
    customerMobile: "07700900123",
    pickupLabel: journeyBase.pickupAddress,
    dropoffLabel: journeyBase.dropoffAddress,
    expiresOn: "2099-12-31",
    singleUse: true,
    agreedAmount: 1, // browser value is ignored for live quotes
    standardWebsiteAmount: 999,
    pricingMode: "live-discount",
    discountType: "percent",
    discountValue: 10,
    expressDropOffSelected: false,
    journey: {
      passengers: 3,
      suitcases: 3,
      vehicle: PARTY_VEHICLE,
      returnJourney: false,
      tripDate: "2026-11-11",
      tripTime: "10:00",
    },
  });
  assert.ok("ok" in created && created.ok, `personal quote created: ${JSON.stringify(created)}`);
  if (!("ok" in created)) return;
  const pq = created.quote as unknown as PersonalQuoteRecord;
  const expected = applyPersonalQuoteDiscount(main3.amount, { discountType: "percent", discountValue: 10 });
  assert.equal(pq.standardWebsiteAmount, main3.amount, "website price comes from the main tool, not the browser");
  assert.equal(pq.agreedAmount, expected.transferGbp, "10% off the main tool price");
  assert.equal(pq.journey?.passengers, 3, "3 passengers saved");
  assert.equal(pq.journey?.suitcases, 3, "3 suitcases saved");

  const summary = toPersonalQuotePublicSummary(pq);
  assert.equal(summary.pricingMode, "live-discount");
  assert.equal(summary.journey?.passengers, 3, "customer link opens with 3 passengers");
  assert.equal(summary.journey?.suitcases, 3, "customer link opens with 3 suitcases");
  assert.equal(summary.discountType, "percent");
  assert.equal(summary.discountValue, 10);

  console.log("=== Checkout re-prices the customer's final choices ===");
  const same = await resolvePersonalQuoteForPayment(store, pq.code, {
    returnJourney: false,
    expressDropOffSelected: false,
    liveBooking: {
      pickupLabel: journeyBase.pickupAddress,
      dropoffLabel: journeyBase.dropoffAddress,
      passengers: 3,
      suitcases: 3,
      vehicle: PARTY_VEHICLE,
      tripDate: "2026-11-11",
      tripTime: "10:00",
    },
    pricingEnv: env,
  });
  assert.ok(same.ok, JSON.stringify(same));
  if (same.ok) {
    assert.equal(same.amount, expected.transferGbp, "checkout charges what the link showed");
    assert.equal(same.websiteTransferGbp, main3.amount);
  }

  // Customer switches to a Saturday-night return: re-priced by the main tool, same 10% off.
  const changedBody = mainQuoteRequestBody({
    ...journeyBase,
    returnJourney: true,
    outboundDate: "2026-11-14",
    outboundTime: "23:30",
    returnDate: "2026-11-21",
    returnTime: "14:00",
    passengers: 2,
    suitcases: 1,
    vehicleType: "Standard Saloon (1–4 passengers)",
  });
  const mainChanged = await priceWithMainQuoteTool(changedBody, env);
  assert.ok(mainChanged.ok);
  const changed = await resolvePersonalQuoteForPayment(store, pq.code, {
    returnJourney: true,
    expressDropOffSelected: false,
    liveBooking: {
      pickupLabel: journeyBase.pickupAddress,
      dropoffLabel: journeyBase.dropoffAddress,
      passengers: 2,
      suitcases: 1,
      vehicle: "Standard Saloon (1–4 passengers)",
      tripDate: "2026-11-14",
      tripTime: "23:30",
      returnDate: "2026-11-21",
      returnTime: "14:00",
    },
    pricingEnv: env,
  });
  assert.ok(changed.ok && mainChanged.ok);
  if (changed.ok && mainChanged.ok) {
    assert.notEqual(mainChanged.amount, main3.amount, "fixture: changes move the website price");
    assert.equal(
      changed.amount,
      applyPersonalQuoteDiscount(mainChanged.amount, { discountType: "percent", discountValue: 10 }).transferGbp,
      "changed journey: main tool price less 10%",
    );
    console.log(`  Changed to return/night: £${mainChanged.amount} → £${changed.amount}`);
  }

  // Route is locked to the quote.
  const otherRoute = await resolvePersonalQuoteForPayment(store, pq.code, {
    returnJourney: false,
    liveBooking: {
      pickupLabel: "1 Market Square, Lisburn, UK",
      dropoffLabel: journeyBase.dropoffAddress,
      passengers: 3,
      suitcases: 3,
      vehicle: PARTY_VEHICLE,
      tripDate: "2026-11-11",
      tripTime: "10:00",
    },
    pricingEnv: env,
  });
  assert.equal(otherRoute.ok, false, "a different route cannot use the discount");
  if (!otherRoute.ok) assert.equal(otherRoute.status, 409);

  console.log("=== Older fixed-price personal quotes are unchanged ===");
  const legacy = await handleOwnerCreatePersonalQuote(ownerRequest(), env, {
    customerName: "Legacy Customer",
    agreedAmount: 40,
    standardWebsiteAmount: 45,
    pickupLabel: journeyBase.pickupAddress,
    dropoffLabel: journeyBase.dropoffAddress,
    expiresOn: "2099-12-31",
    singleUse: true,
    expressDropOffSelected: false,
  });
  assert.ok("ok" in legacy && legacy.ok);
  if ("ok" in legacy) {
    const legacyRecord = legacy.quote as unknown as PersonalQuoteRecord;
    assert.equal(legacyRecord.pricingMode, undefined);
    const paid = await resolvePersonalQuoteForPayment(store, legacyRecord.code, {
      returnJourney: false,
      expressDropOffSelected: false,
    });
    assert.ok(paid.ok && paid.amount === 40, "legacy quote still charges its fixed amount");
  }

  console.log("=== Quote again: recent customers ===");
  const list = await handleOwnerListPersonalQuotes(ownerRequest(), env);
  assert.ok("ok" in list);
  if ("ok" in list) {
    const names = list.recentCustomers.map((c) => c.customerName);
    assert.deepEqual(names, ["Legacy Customer", "Test Customer"], "most recent first, one entry per customer");
    const test = list.recentCustomers.find((c) => c.customerName === "Test Customer");
    assert.equal(test?.customerMobile, "07700900123");
    assert.equal(test?.journey?.passengers, 3);
  }
  const unauthorised = await handleOwnerListPersonalQuotes(new Request("https://x.invalid"), env);
  assert.ok("error" in unauthorised, "recent customers are owner-only");

  console.log("PASS");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = realFetch;
  });
