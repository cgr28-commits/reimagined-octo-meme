/**
 * Owner Pricing tab + 7 Seater Minibus + configurable surcharges.
 * Run: npx tsx scripts/check-owner-pricing.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_ESTATE_UPLIFT_GBP,
  DEFAULT_MINIBUS_MULTIPLIER,
  DEFAULT_PUBLIC_MINIBUS_ENABLED,
  DEFAULT_RETURN_DISCOUNT_RATE,
  DEFAULT_NIGHT_SURCHARGE_RATE,
  DEFAULT_WEEKEND_SURCHARGE_RATE,
  DEFAULT_NIGHT_START_MINUTES,
  DEFAULT_NIGHT_END_MINUTES,
  PUBLIC_MINIBUS_UNAVAILABLE_CODE,
  PUBLIC_MINIBUS_UNAVAILABLE_MESSAGE,
  defaultOwnerPricingSettings,
  minibusBaseFareFromSaloon,
  normalizeOwnerPricingSettings,
  ownerPricingEngineOptions,
  previewSurchargeOnBase,
  previewVehicleFaresFromSaloon,
  publicMaxPassengers,
  publicMaxSuitcases,
  publicMinibusAllowed,
  surchargeRateForDateTime,
  validateOwnerPricingInput,
  type OwnerPricingSettings,
} from "../shared/owner-pricing-config";
import { applyTripPremium, isTripPremiumDateTime } from "../src/lib/point-to-point-premium";
import {
  calculateUniversalEstateJourneyFareGbp,
  calculateUniversalJourneyFareGbp,
  UNIVERSAL_ESTATE_PREMIUM_GBP,
} from "../shared/universal-distance-pricing";
import { RETURN_JOURNEY_DISCOUNT_RATE } from "../shared/return-journey-discount";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { MINIBUS_VEHICLE, SALOON_VEHICLE, ESTATE_VEHICLE } from "../src/lib/vehicle-selection";
import { vehicleCustomerLabel } from "../shared/vehicle-display";
import {
  getOwnerPricingSettings,
  saveOwnerPricingSettings,
  OwnerPricingConflictError,
  OwnerPricingValidationError,
} from "../workers/addresses/src/owner-pricing-store";
import { handleOwnerPricingRequest } from "../workers/addresses/src/owner-pricing-handlers";
import { ownerAuthorized } from "../workers/addresses/src/driver-auth";
import {
  PREVIEW_PRICING_FORBIDDEN_CODE,
  hostnameIsPricingPreview,
  originIsPricingPreview,
} from "../shared/pricing-preview-isolation";
import { NIGHT_WEEKEND_SURCHARGE_RATE } from "../shared/night-weekend-surcharge";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

async function checkAsync(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

function memoryKv(initial: Record<string, unknown> = {}) {
  const data = new Map<string, string>();
  for (const [key, value] of Object.entries(initial)) {
    data.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  return {
    async get(key: string, type?: string) {
      const raw = data.get(key);
      if (raw == null) return null;
      return type === "json" ? JSON.parse(raw) : raw;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
  } as unknown as KVNamespace;
}

function withOverrides(
  overrides: Partial<OwnerPricingSettings> & {
    estate?: Partial<OwnerPricingSettings["estate"]>;
    minibus?: Partial<OwnerPricingSettings["minibus"]>;
    returnDiscount?: Partial<OwnerPricingSettings["returnDiscount"]>;
    night?: Partial<OwnerPricingSettings["night"]>;
    weekend?: Partial<OwnerPricingSettings["weekend"]>;
  },
): OwnerPricingSettings {
  const base = defaultOwnerPricingSettings();
  return {
    ...base,
    ...overrides,
    estate: { ...base.estate, ...overrides.estate },
    minibus: { ...base.minibus, ...overrides.minibus },
    returnDiscount: { ...base.returnDiscount, ...overrides.returnDiscount },
    night: { ...base.night, ...overrides.night },
    weekend: { ...base.weekend, ...overrides.weekend },
  };
}

console.log("=== 1. Missing config uses approved defaults ===");
check("missing config → Saloon / Estate / Minibus / Return / Night / Weekend / public OFF", () => {
  const normalized = normalizeOwnerPricingSettings(null);
  assert.equal(normalized.estate.upliftGbp, 6);
  assert.equal(DEFAULT_ESTATE_UPLIFT_GBP, 6);
  assert.equal(normalized.minibus.multiplier, 1.55);
  assert.equal(DEFAULT_MINIBUS_MULTIPLIER, 1.55);
  assert.equal(normalized.returnDiscount.rate, 0.05);
  assert.equal(DEFAULT_RETURN_DISCOUNT_RATE, RETURN_JOURNEY_DISCOUNT_RATE);
  assert.equal(normalized.night.surchargeRate, 0.1);
  assert.equal(normalized.weekend.surchargeRate, 0.1);
  assert.equal(normalized.night.startMinutes, 22 * 60);
  assert.equal(normalized.night.endMinutes, 6 * 60);
  assert.deepEqual(normalized.weekend.days, [0, 6]);
  assert.equal(normalized.minibus.publicEnabled, false);
  assert.equal(DEFAULT_PUBLIC_MINIBUS_ENABLED, false);
  assert.equal(normalized.saloon.minimumFareGbp, 29);
});

check("corrupt config falls back and never enables public Minibus", () => {
  const normalized = normalizeOwnerPricingSettings({
    schemaVersion: 1,
    minibus: { publicEnabled: true, multiplier: "nope" },
    estate: { upliftGbp: -99 },
  });
  assert.equal(normalized.minibus.publicEnabled, false);
  assert.equal(normalized.minibus.multiplier, 1.55);
  assert.equal(normalized.estate.upliftGbp, 6);
});

check("invalid values are rejected, not clamped", () => {
  const invalid = validateOwnerPricingInput({
    ...defaultOwnerPricingSettings(),
    minibus: { publicEnabled: false, multiplier: 0 },
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.match(invalid.errors[0]!.message, /greater than zero|between 1.00 and 3.00/i);
  }
});

async function run(): Promise<void> {
console.log("\n=== 2. Persistence / concurrency / access ===");
await checkAsync("config persists and survives reload", async () => {
  const store = memoryKv();
  const first = await getOwnerPricingSettings(store);
  assert.equal(first.minibus.publicEnabled, false);
  const saved = await saveOwnerPricingSettings(
    store,
    withOverrides({
      estate: { upliftGbp: 8 },
      minibus: { publicEnabled: true, multiplier: 1.6 },
    }),
    { expectedVersion: first.version, actor: "owner" },
  );
  assert.equal(saved.settings.estate.upliftGbp, 8);
  assert.equal(saved.settings.minibus.publicEnabled, true);
  const reloaded = await getOwnerPricingSettings(store);
  assert.equal(reloaded.estate.upliftGbp, 8);
  assert.equal(reloaded.minibus.multiplier, 1.6);
  assert.equal(reloaded.version, first.version + 1);
  assert.ok(saved.audit.length >= 1);
});

await checkAsync("stale configuration update is rejected", async () => {
  const store = memoryKv();
  const seeded = await saveOwnerPricingSettings(store, defaultOwnerPricingSettings(), {
    actor: "owner",
  });
  await saveOwnerPricingSettings(store, withOverrides({ estate: { upliftGbp: 7 } }), {
    expectedVersion: seeded.settings.version,
  });
  await assert.rejects(
    () =>
      saveOwnerPricingSettings(store, withOverrides({ estate: { upliftGbp: 9 } }), {
        expectedVersion: seeded.settings.version,
      }),
    (error: unknown) => error instanceof OwnerPricingConflictError,
  );
});

await checkAsync("invalid save is rejected", async () => {
  const store = memoryKv();
  await assert.rejects(
    () =>
      saveOwnerPricingSettings(store, { ...defaultOwnerPricingSettings(), estate: { upliftGbp: -1 } }),
    (error: unknown) => error instanceof OwnerPricingValidationError,
  );
});

check("unauthorized owner writes rejected without owner key", () => {
  const request = new Request("https://example.test/owner/pricing", {
    method: "POST",
    headers: { "X-Owner-Key": "wrong" },
  });
  assert.equal(ownerAuthorized(request, { OWNER_ACCESS_KEY: "correct-key" }), false);
});

check("preview hosts are isolated from production hostnames", () => {
  assert.equal(hostnameIsPricingPreview("my-airport-taxi-ni-quote-git-cursor-owner-pricin-f2b558-colin15.vercel.app"), true);
  assert.equal(hostnameIsPricingPreview("localhost"), true);
  assert.equal(hostnameIsPricingPreview("www.myairporttaxini.co.uk"), false);
  assert.equal(originIsPricingPreview("https://www.myairporttaxini.co.uk"), false);
});

await checkAsync("preview Origin cannot write production pricing KV", async () => {
  const store = memoryKv({
    "owner:pricing-settings": defaultOwnerPricingSettings(),
  });
  const request = new Request("https://reimagined-octo-meme.cgr28.workers.dev/owner/pricing", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Owner-Key": "correct-key",
      Origin: "https://example.vercel.app",
    },
    body: JSON.stringify({
      settings: withOverrides({ estate: { upliftGbp: 99 } }),
      expectedVersion: 1,
    }),
  });
  const response = await handleOwnerPricingRequest(
    request,
    { OWNER_ACCESS_KEY: "correct-key", TRACKING_STORE: store as never },
    "https://example.vercel.app",
  );
  assert.equal(response.status, 403);
  const body = (await response.json()) as { code?: string };
  assert.equal(body.code, PREVIEW_PRICING_FORBIDDEN_CODE);
  const stored = await store.get("owner:pricing-settings", "json");
  assert.equal((stored as { estate?: { upliftGbp?: number } } | null)?.estate?.upliftGbp, 6);
});

console.log("\n=== 3. Vehicles / defaults unchanged ===");
check("existing Saloon / Estate quotes unchanged with default config", () => {
  const saloon = calculateUniversalJourneyFareGbp(15, SALOON_VEHICLE);
  const estate = calculateUniversalJourneyFareGbp(15, ESTATE_VEHICLE);
  const withDefaults = calculateUniversalJourneyFareGbp(15, ESTATE_VEHICLE, ownerPricingEngineOptions());
  assert.equal(estate.journeyFareGbp, saloon.journeyFareGbp + UNIVERSAL_ESTATE_PREMIUM_GBP);
  assert.equal(withDefaults.journeyFareGbp, estate.journeyFareGbp);
});

check("configurable Estate uplift works", () => {
  const saloon = calculateUniversalJourneyFareGbp(15, SALOON_VEHICLE);
  const estate = calculateUniversalJourneyFareGbp(15, ESTATE_VEHICLE, { estatePremiumGbp: 8 });
  assert.equal(estate.journeyFareGbp, saloon.journeyFareGbp + 8);
});

check("Minibus ×1.55 is penny-rounded only: £56 × 1.55 = £86.80", () => {
  const from50 = minibusBaseFareFromSaloon(50);
  assert.equal(from50.estateGbp, 56);
  assert.equal(from50.minibusExactGbp, 86.8);
  assert.equal(from50.minibusQuotedGbp, 86.8);
  const priced = calculateUniversalJourneyFareGbp(0, MINIBUS_VEHICLE, {
    saloonFareGbp: 50,
    minibusMultiplier: 1.55,
    estatePremiumGbp: 6,
  });
  assert.equal(priced.journeyFareGbp, 86.8);
  assert.notEqual(priced.journeyFareGbp, 85);
  assert.notEqual(priced.journeyFareGbp, Math.round((56 * 1.55) / 5) * 5);

  const sixty = calculateUniversalJourneyFareGbp(0, MINIBUS_VEHICLE, {
    saloonFareGbp: 54,
    minibusMultiplier: 1.55,
    estatePremiumGbp: 6,
  });
  assert.equal(sixty.journeyFareGbp, 93);

  const seventyThree = calculateUniversalJourneyFareGbp(0, MINIBUS_VEHICLE, {
    saloonFareGbp: 67,
    minibusMultiplier: 1.55,
    estatePremiumGbp: 6,
  });
  assert.equal(seventyThree.journeyFareGbp, 113.15);
});

check("changed Minibus multiplier works without nearest-£5 rounding", () => {
  const priced = calculateUniversalJourneyFareGbp(0, MINIBUS_VEHICLE, {
    saloonFareGbp: 50,
    minibusMultiplier: 1.6,
    estatePremiumGbp: 6,
  });
  assert.equal(priced.journeyFareGbp, 89.6);
  assert.notEqual(priced.journeyFareGbp, 90);

  const oneSixtyFive = calculateUniversalJourneyFareGbp(0, MINIBUS_VEHICLE, {
    saloonFareGbp: 50,
    minibusMultiplier: 1.65,
    estatePremiumGbp: 6,
  });
  assert.equal(oneSixtyFive.journeyFareGbp, 92.4);
  assert.notEqual(oneSixtyFive.journeyFareGbp, Math.round((56 * 1.65) / 5) * 5);
});

check("public Minibus OFF hides and is enforced", () => {
  assert.equal(publicMinibusAllowed(MINIBUS_VEHICLE, { publicMinibusEnabled: false }), false);
  assert.equal(publicMinibusAllowed(MINIBUS_VEHICLE, { publicMinibusEnabled: true }), true);
  assert.equal(
    publicMinibusAllowed(MINIBUS_VEHICLE, { publicMinibusEnabled: false, ownerMode: true }),
    true,
  );
  assert.equal(publicMaxPassengers(false), 4);
  assert.equal(publicMaxPassengers(true), 7);
  assert.equal(publicMaxSuitcases(false), 4);
  assert.equal(publicMaxSuitcases(true), 5);
});

check("8 passengers rejected; 7 accepted when public ON; MPV unavailable", () => {
  const on = withOverrides({ minibus: { publicEnabled: true, multiplier: 1.55 } });
  const seven = calculateAuthoritativeWebsiteQuote({
    pickupAddress: "Belfast City Hall, Belfast",
    dropoffAddress: "Belfast International Airport",
    airportCode: "BFS",
    fromAirport: false,
    returnJourney: false,
    passengers: 7,
    suitcases: 2,
    vehicleType: MINIBUS_VEHICLE,
    routeMetrics: { distanceKm: 22, durationMinutes: 25 },
    pricing: on,
    maxPassengers: 7,
  });
  assert.equal(seven.ok, true);
  const eight = calculateAuthoritativeWebsiteQuote({
    pickupAddress: "Belfast City Hall, Belfast",
    dropoffAddress: "Belfast International Airport",
    airportCode: "BFS",
    returnJourney: false,
    passengers: 8,
    suitcases: 2,
    vehicleType: MINIBUS_VEHICLE,
    routeMetrics: { distanceKm: 22, durationMinutes: 25 },
    pricing: on,
    maxPassengers: 7,
  });
  assert.equal(eight.ok, false);
  const vehicles = read("src/lib/data.ts");
  assert.match(vehicles, /Minibus \(5–7 passengers\)/);
  assert.doesNotMatch(vehicles, /"MPV"/);
  assert.doesNotMatch(read("src/components/QuoteCard.tsx"), /MPV/);
});

check("public OFF rejects public Minibus quote; owner mode still works", () => {
  const publicOff = calculateAuthoritativeWebsiteQuote({
    pickupAddress: "Belfast City Hall, Belfast",
    dropoffAddress: "Belfast International Airport",
    airportCode: "BFS",
    returnJourney: false,
    passengers: 6,
    suitcases: 2,
    vehicleType: MINIBUS_VEHICLE,
    routeMetrics: { distanceKm: 22, durationMinutes: 25 },
    maxPassengers: 7,
  });
  assert.equal(publicOff.ok, false);
  if (!publicOff.ok) {
    assert.ok(
      publicOff.reason === "passenger_limit" || publicOff.reason === "vehicle_unavailable",
    );
    assert.match(publicOff.message, /4 passengers|unavailable/i);
  }
  const owner = calculateAuthoritativeWebsiteQuote({
    pickupAddress: "Belfast City Hall, Belfast",
    dropoffAddress: "Belfast International Airport",
    airportCode: "BFS",
    returnJourney: false,
    passengers: 6,
    suitcases: 2,
    vehicleType: MINIBUS_VEHICLE,
    routeMetrics: { distanceKm: 22, durationMinutes: 25 },
    maxPassengers: 7,
    ownerMode: true,
  });
  assert.equal(owner.ok, true);
});

check("customer label is 7 Seater Minibus, never raw minibus", () => {
  assert.equal(vehicleCustomerLabel(MINIBUS_VEHICLE), "7 Seater Minibus");
  assert.doesNotMatch(vehicleCustomerLabel(MINIBUS_VEHICLE), /^minibus$/i);
});

console.log("\n=== 4. Percentages and stacking ===");
check("return 5% / 10% / 0% and Night/Weekend 10% / 20% / 0%", () => {
  const base = applyTripPremium(44, {
    outboundDate: "2026-08-19",
    outboundTime: "10:00",
    returnJourney: true,
    returnDate: "2026-08-20",
    returnTime: "10:00",
  });
  assert.equal(Math.round(base.total * 100) / 100, 83.6);

  const ten = applyTripPremium(
    44,
    {
      outboundDate: "2026-08-19",
      outboundTime: "10:00",
      returnJourney: true,
      returnDate: "2026-08-20",
      returnTime: "10:00",
    },
    0.1,
    { pricing: withOverrides({ returnDiscount: { rate: 0.1 } }) },
  );
  assert.equal(Math.round(ten.total * 100) / 100, 79.2);

  const zero = applyTripPremium(
    44,
    {
      outboundDate: "2026-08-19",
      outboundTime: "10:00",
      returnJourney: true,
      returnDate: "2026-08-20",
      returnTime: "10:00",
    },
    0.1,
    { pricing: withOverrides({ returnDiscount: { rate: 0 } }) },
  );
  assert.equal(zero.total, 88);

  const oneNight = applyTripPremium(44, {
    outboundDate: "2026-08-19",
    outboundTime: "23:00",
    returnJourney: true,
    returnDate: "2026-08-20",
    returnTime: "10:00",
  });
  assert.equal(Math.round(oneNight.total * 100) / 100, 88);

  const both = applyTripPremium(44, {
    outboundDate: "2026-08-22",
    outboundTime: "10:00",
    returnJourney: true,
    returnDate: "2026-08-23",
    returnTime: "10:00",
  });
  assert.equal(Math.round(both.total * 100) / 100, 92.4);

  const night20 = applyTripPremium(
    44,
    {
      outboundDate: "2026-08-19",
      outboundTime: "23:00",
      returnJourney: false,
    },
    0.1,
    { pricing: withOverrides({ night: { ...defaultOwnerPricingSettings().night, surchargeRate: 0.2 } }) },
  );
  assert.equal(Math.round(night20.total * 100) / 100, 52.8);

  const night0 = applyTripPremium(
    44,
    {
      outboundDate: "2026-08-19",
      outboundTime: "23:00",
      returnJourney: false,
    },
    0.1,
    { pricing: withOverrides({ night: { ...defaultOwnerPricingSettings().night, surchargeRate: 0 } }) },
  );
  assert.equal(night0.total, 44);
});

check("Night / Weekend boundaries and highest-applicable stacking", () => {
  assert.equal(isTripPremiumDateTime("2026-08-24", "05:59"), true);
  assert.equal(isTripPremiumDateTime("2026-08-24", "06:00"), false);
  assert.equal(isTripPremiumDateTime("2026-08-19", "21:59"), false);
  assert.equal(isTripPremiumDateTime("2026-08-19", "22:00"), true);
  assert.equal(isTripPremiumDateTime("2026-08-22", "00:00"), true);
  assert.equal(isTripPremiumDateTime("2026-08-23", "23:59"), true);
  assert.equal(isTripPremiumDateTime("2026-08-24", "00:00"), true);
  const overlap = surchargeRateForDateTime({
    day: 6,
    minutes: 23 * 60,
    nightRate: 0.2,
    weekendRate: 0.1,
    rules: ownerPricingEngineOptions(),
  });
  assert.equal(overlap, 0.2);
});

check("£100 − 5% + 10% + £6 fixed = £111, not £110.50", () => {
  const eligibleBase = 100;
  const discounted = eligibleBase * (1 - 0.05);
  const surcharge = eligibleBase * 0.1;
  const total = Math.round((discounted + surcharge + 6) * 100) / 100;
  assert.equal(total, 111);
  assert.notEqual(Math.round((eligibleBase * 0.95 * 1.1 + 6) * 100) / 100, 111);
  const engine = applyTripPremium(50, {
    outboundDate: "2026-08-22",
    outboundTime: "10:00",
    returnJourney: true,
    returnDate: "2026-08-23",
    returnTime: "10:00",
  });
  assert.equal(Math.round((engine.total + 6) * 100) / 100, 111);
});

console.log("\n=== 5. Minibus order and fixed charges ===");
check("Saloon → Estate +£6 → Minibus ×1.55; Night from Minibus base; fixed not multiplied", () => {
  const preview = previewVehicleFaresFromSaloon(50);
  assert.equal(preview.estateGbp, 56);
  assert.equal(preview.minibusExactGbp, 86.8);
  assert.equal(preview.minibusQuotedGbp, 86.8);
  const night10 = previewSurchargeOnBase(86.8, 0.1);
  assert.equal(night10.surchargeGbp, 8.68);
  const night20 = previewSurchargeOnBase(86.8, 0.2);
  assert.equal(night20.surchargeGbp, 17.36);
  const minibusThenNight = applyTripPremium(86.8, {
    outboundDate: "2026-08-19",
    outboundTime: "23:00",
    returnJourney: false,
  });
  assert.equal(Math.round(minibusThenNight.premiumAmount * 100) / 100, 8.68);
  const withFixed = minibusThenNight.total + 5;
  assert.equal(Math.round(withFixed * 100) / 100, 100.48);
  assert.notEqual(5 * 1.55, 5);
});

console.log("\n=== 6. Source guards ===");
check("Pricing tab, public gate, image slot, no MPV restore", () => {
  const switcher = read("src/components/OwnerDashboardToolSwitcher.tsx");
  const panel = read("src/components/OwnerPricingPanel.tsx");
  const card = read("src/components/QuoteCard.tsx");
  const showcase = read("src/components/QuoteResultShowcase.tsx");
  const handlers = read("workers/addresses/src/quote-handlers.ts");
  const index = read("workers/addresses/src/index.ts");
  const pricing = read("shared/universal-distance-pricing.ts");
  const quoteLib = read("src/lib/quote.ts");
  assert.match(switcher, /"pricing"/);
  assert.match(panel, /7 Seater Minibus/);
  assert.match(panel, /Preview — unsaved settings/);
  assert.doesNotMatch(panel, /quoted \(nearest £5\)/i);
  assert.match(panel, /PREVIEW_PRICING_BANNER/);
  assert.match(read("shared/pricing-preview-isolation.ts"), /PREVIEW MODE/);
  assert.match(read("src/lib/owner-pricing-api.ts"), /isBrowserPricingPreview/);
  assert.match(read("src/app/owner/pricing-preview/page.tsx"), /OwnerPricingPreviewClient/);
  assert.match(read("src/app/owner/pricing-preview/vehicles/page.tsx"), /PreviewVehicleCardsClient/);
  assert.match(read("workers/addresses/src/owner-pricing-handlers.ts"), /PREVIEW_PRICING_FORBIDDEN/);
  assert.match(pricing, /roundUniversalMinibusFareGbp/);
  assert.doesNotMatch(pricing, /Math\.round\(\(estateGbp \* minibusMult\) \/ 5\) \* 5/);
  assert.doesNotMatch(
    quoteLib,
    /roundToNearestFive\(estate \* options\.minibusMultiplier\)/,
  );
  assert.match(card, /publicMinibusEnabled/);
  assert.match(read("src/components/QuoteVehicleCategories.tsx"), /MINIBUS_CUSTOMER_NAME/);
  assert.match(read("shared/vehicle-display.ts"), /7 Seater Minibus/);
  assert.match(showcase, /quote-minibus\.webp/);
  assert.match(handlers, /PUBLIC_MINIBUS_UNAVAILABLE/);
  assert.match(index, /isOwnerPricingPath/);
  assert.match(index, /PUBLIC_MINIBUS_UNAVAILABLE_CODE/);
  assert.doesNotMatch(card, /MPV/);
  assert.equal(fs.existsSync(path.join(root, "public/images/vehicles/quote-minibus.webp")), true);
  assert.equal(fs.existsSync(path.join(root, "public/images/vehicles/quote-minibus.svg")), false);
  const previewCards = read("src/components/PreviewVehicleCardsClient.tsx");
  assert.match(previewCards, /quote-minibus\.webp/);
  assert.doesNotMatch(previewCards, /QuoteResultShowcase/);
  assert.equal(DEFAULT_NIGHT_SURCHARGE_RATE, NIGHT_WEEKEND_SURCHARGE_RATE);
  assert.equal(DEFAULT_WEEKEND_SURCHARGE_RATE, NIGHT_WEEKEND_SURCHARGE_RATE);
  assert.equal(DEFAULT_NIGHT_START_MINUTES, 22 * 60);
  assert.equal(DEFAULT_NIGHT_END_MINUTES, 6 * 60);
});

console.log("\nOwner pricing checks passed.");
}

void run();
