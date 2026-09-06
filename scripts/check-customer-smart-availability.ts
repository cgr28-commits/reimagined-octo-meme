/**
 * Customer Smart Availability gate — flag-off unchanged, flag-on blocks payment.
 * Uses the same evaluateSmartAvailability engine as the Owner Availability tool.
 * Run: npx tsx scripts/check-customer-smart-availability.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CUSTOMER_SMART_AVAILABILITY_CODE,
  CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE,
  customerSmartAvailabilityPreviewRequested,
  decideCustomerSmartAvailabilityGate,
  customerUnavailableAtTimeMessage,
  evaluateCustomerSmartAvailability,
  isPagesPreviewOrigin,
  isProductionCustomerOrigin,
  OWNER_AVAILABILITY_DEFAULT_DURATION_MINUTES,
  requestedJourneysFromCustomerBooking,
  resolveCustomerAvailabilityDurationMinutes,
  shouldEnforceCustomerSmartAvailability,
  shouldOfferCustomerAlternativeTimes,
  toPublicCustomerSmartAvailability,
  withCustomerSmartAvailabilityPreviewQuery,
} from "../shared/customer-smart-availability";
import {
  DEFAULT_SMART_OPS_CONFIG,
  customerFacingSmartOpsEnabled,
  normalizeSmartOpsConfig,
} from "../shared/smart-ops-config";
import {
  evaluateSmartAvailability,
  positioningTimeNeededMinutes,
  repositionMinutes,
  type SmartOccupiedJob,
} from "../shared/smart-conflict";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const BFS = { lat: 54.6575, lng: -6.2158 };
const BELFAST = { lat: 54.5964, lng: -5.9302 };
const BHD = { lat: 54.6181, lng: -5.8724 };
const LARNE = { lat: 54.851, lng: -5.811 };
const MONDAY = "2026-09-07";
const NOW = new Date("2026-09-06T12:00:00+01:00");

const config = normalizeSmartOpsConfig({
  ...DEFAULT_SMART_OPS_CONFIG,
  flags: {
    ...DEFAULT_SMART_OPS_CONFIG.flags,
    smartAvailability: false,
    alternativeTimeSuggestions: false,
    smartReturnPricing: false,
    returnCorridorMatching: false,
    backupDriverCapacity: false,
    shadowMode: true,
  },
});

const larneAt0700: SmartOccupiedJob = {
  id: "TAAA4672EAN",
  pickupLabel: "12 Wyncairn Gardens, Larne BT40 2EB",
  dropoffLabel: "George Best Belfast City Airport",
  pickup: LARNE,
  dropoff: BHD,
  tripDate: MONDAY,
  tripTime: "07:00",
  durationMinutes: 33,
  airportCode: "BHD",
};

const bfsToCity = {
  pickupLabel: "Belfast International Airport",
  dropoffLabel: "Belfast City Centre",
  pickup: BFS,
  dropoff: BELFAST,
  tripDate: MONDAY,
  durationMinutes: 30,
  airportCode: "BFS" as const,
  isFromAirport: true,
};

console.log("=== Defaults and customer flags stay OFF ===");
{
  assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.smartAvailability, false);
  assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.alternativeTimeSuggestions, false);
  assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.smartReturnPricing, false);
  assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.returnCorridorMatching, false);
  assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.backupDriverCapacity, false);
  assert.equal(DEFAULT_SMART_OPS_CONFIG.flags.shadowMode, true);
  assert.equal(customerFacingSmartOpsEnabled(DEFAULT_SMART_OPS_CONFIG), false);
  assert.equal(customerFacingSmartOpsEnabled(config), false);

  const saveHandler = read("workers/addresses/src/smart-ops-handlers.ts");
  assert.match(saveHandler, /smartAvailability:\s*false/);
  assert.match(saveHandler, /alternativeTimeSuggestions:\s*false/);
  assert.match(saveHandler, /smartReturnPricing:\s*false/);
  assert.match(saveHandler, /returnCorridorMatching:\s*false/);
  assert.match(saveHandler, /backupDriverCapacity:\s*false/);
  assert.match(saveHandler, /shadowMode:\s*true/);
  console.log("OK  production defaults + save-handler lock keep customer flags OFF");
}

console.log("\n=== Flag OFF → customer gate does not enforce ===");
{
  assert.equal(
    shouldEnforceCustomerSmartAvailability({
      smartAvailabilityFlag: false,
      origin: "https://www.myairporttaxini.co.uk",
      previewRequested: false,
    }),
    false,
  );
  assert.equal(
    shouldEnforceCustomerSmartAvailability({
      smartAvailabilityFlag: false,
      origin: "https://www.myairporttaxini.co.uk",
      previewRequested: true,
    }),
    false,
    "production www ignores the preview header while the flag is off",
  );

  const unavailableBooking = {
    pickupLabel: bfsToCity.pickupLabel,
    dropoffLabel: bfsToCity.dropoffLabel,
    tripDate: MONDAY,
    tripTime: "05:33",
    vehicle: "Saloon",
    airportCode: "BFS",
    isFromAirport: true,
    routeDurationMinutes: 30,
    pickupLat: BFS.lat,
    pickupLng: BFS.lng,
    dropoffLat: BELFAST.lat,
    dropoffLng: BELFAST.lng,
  };
  const skipped = decideCustomerSmartAvailabilityGate({
    enforce: false,
    booking: unavailableBooking,
    occupied: [larneAt0700],
    config,
    now: NOW,
  });
  assert.equal(skipped.enforce, false);
  assert.equal(skipped.blocked, false);
  assert.equal(skipped.available, true);
  assert.equal(skipped.customerMessage, null);
  assert.equal(skipped.decision, null);
  console.log("OK  flag OFF leaves an unavailable slot unblocked");
}

console.log("\n=== Flag ON + available → customer can continue ===");
{
  assert.equal(
    shouldEnforceCustomerSmartAvailability({
      smartAvailabilityFlag: true,
      origin: "https://www.myairporttaxini.co.uk",
    }),
    true,
  );
  const allowed = decideCustomerSmartAvailabilityGate({
    enforce: true,
    booking: {
      pickupLabel: bfsToCity.pickupLabel,
      dropoffLabel: bfsToCity.dropoffLabel,
      tripDate: MONDAY,
      tripTime: "05:32",
      airportCode: "BFS",
      isFromAirport: true,
      routeDurationMinutes: 30,
      pickupLat: BFS.lat,
      pickupLng: BFS.lng,
      dropoffLat: BELFAST.lat,
      dropoffLng: BELFAST.lng,
    },
    occupied: [larneAt0700],
    config,
    now: NOW,
  });
  assert.equal(allowed.enforce, true);
  assert.equal(allowed.blocked, false);
  assert.equal(allowed.available, true);
  assert.equal(allowed.customerMessage, null);
  assert.equal(allowed.decision?.alternatives.length, 0);
  assert.equal(allowed.alternativeTimes.length, 0);
  console.log("OK  flag ON + 05:32 before Larne stays bookable");
}

console.log("\n=== Flag ON + unavailable → customer cannot proceed to payment ===");
{
  const blocked = decideCustomerSmartAvailabilityGate({
    enforce: true,
    booking: {
      pickupLabel: bfsToCity.pickupLabel,
      dropoffLabel: bfsToCity.dropoffLabel,
      tripDate: MONDAY,
      tripTime: "05:33",
      airportCode: "BFS",
      isFromAirport: true,
      routeDurationMinutes: 30,
      pickupLat: BFS.lat,
      pickupLng: BFS.lng,
      dropoffLat: BELFAST.lat,
      dropoffLng: BELFAST.lng,
    },
    occupied: [larneAt0700],
    config,
    now: NOW,
  });
  assert.equal(blocked.enforce, true);
  assert.equal(blocked.available, false);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.customerMessage, CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE);
  assert.equal(blocked.alternativeTimes.length, 0, "alternatives stay off unless explicitly offered");
  assert.equal(blocked.decision?.alternatives.length, 0, "customer path must not suggest other times by default");
  assert.equal(
    CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE,
    "Unfortunately, we’re not available at that time.",
  );
  assert.equal(CUSTOMER_SMART_AVAILABILITY_CODE, "smart_availability_unavailable");
  const publicPayload = toPublicCustomerSmartAvailability(blocked);
  assert.equal(publicPayload.blocked, true);
  assert.equal(publicPayload.customerMessage, CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE);
  assert.equal("reason" in publicPayload, false);
  assert.equal("decision" in publicPayload, false);
  console.log("OK  flag ON + 05:33 is blocked with the exact customer message");
}

console.log("\n=== Owner tool and customer flow use the same availability decision ===");
{
  const requested = { ...bfsToCity, tripTime: "05:33" };
  const owner = evaluateSmartAvailability({
    requested,
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now: NOW,
  });
  const customer = evaluateCustomerSmartAvailability({
    requested,
    occupied: [larneAt0700],
    config,
    now: NOW,
  });
  assert.equal(customer.available, owner.available);
  assert.equal(customer.reason, owner.reason);
  assert.deepEqual(customer.diagnostics, owner.diagnostics);
  assert.equal(owner.available, false);

  const laterOwner = evaluateSmartAvailability({
    requested: { ...bfsToCity, tripTime: "05:32" },
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now: NOW,
  });
  const laterCustomer = evaluateCustomerSmartAvailability({
    requested: { ...bfsToCity, tripTime: "05:32" },
    occupied: [larneAt0700],
    config,
    now: NOW,
  });
  assert.equal(laterCustomer.available, laterOwner.available);
  assert.equal(laterOwner.available, true);

  const wrapper = read("shared/customer-smart-availability.ts");
  assert.match(wrapper, /return evaluateSmartAvailability\(\{/);
  assert.match(wrapper, /searchAlternatives:\s*input\.searchAlternatives === true/);
  assert.match(wrapper, /export function resolveCustomerAvailabilityDurationMinutes/);
  assert.doesNotMatch(
    wrapper,
    /evaluateSmartAvailability\s*=/,
    "customer wrapper must not replace the owner engine",
  );
  assert.match(wrapper, /export function toPublicCustomerSmartAvailability/);
  const publicFn = wrapper.slice(
    wrapper.indexOf("export function toPublicCustomerSmartAvailability"),
    wrapper.indexOf("export function decideCustomerSmartAvailabilityGate"),
  );
  assert.doesNotMatch(publicFn, /reason:/);
  console.log("OK  customer wrapper is evaluateSmartAvailability({ searchAlternatives: false })");
}

console.log("\n=== After-Larne BFS airport pickup uses the same 08:52 / 08:51 boundary ===");
{
  const bhdToBfs = repositionMinutes(BHD, BFS, {
    fromLabel: "George Best Belfast City Airport",
    toLabel: "Belfast International Airport",
  });
  assert.equal(bhdToBfs, 39);
  assert.equal(positioningTimeNeededMinutes(bhdToBfs, 10), 49);

  const at0852 = decideCustomerSmartAvailabilityGate({
    enforce: true,
    booking: {
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Belfast City Centre",
      tripDate: MONDAY,
      tripTime: "08:52",
      airportCode: "BFS",
      isFromAirport: true,
      routeDurationMinutes: 30,
      pickupLat: BFS.lat,
      pickupLng: BFS.lng,
      dropoffLat: BELFAST.lat,
      dropoffLng: BELFAST.lng,
    },
    occupied: [larneAt0700],
    config,
    now: NOW,
  });
  const at0851 = decideCustomerSmartAvailabilityGate({
    enforce: true,
    booking: {
      pickupLabel: "Belfast International Airport",
      dropoffLabel: "Belfast City Centre",
      tripDate: MONDAY,
      tripTime: "08:51",
      airportCode: "BFS",
      isFromAirport: true,
      routeDurationMinutes: 30,
      pickupLat: BFS.lat,
      pickupLng: BFS.lng,
      dropoffLat: BELFAST.lat,
      dropoffLng: BELFAST.lng,
    },
    occupied: [larneAt0700],
    config,
    now: NOW,
  });
  assert.equal(at0852.blocked, false);
  assert.equal(at0851.blocked, true);
  assert.equal(at0852.decision?.available, true);
  assert.equal(at0851.decision?.available, false);
  console.log("OK  customer gate matches owner BFS after-Larne 08:52 / 08:51");
}

console.log("\n=== Fail-open + refund-test skip + no alternative search ===");
{
  const missing = decideCustomerSmartAvailabilityGate({
    enforce: true,
    booking: { pickupLabel: "", dropoffLabel: "", tripDate: "", tripTime: "" },
    occupied: [larneAt0700],
    config,
    now: NOW,
  });
  assert.equal(missing.blocked, false);
  assert.equal(requestedJourneysFromCustomerBooking({}).length, 0);

  const refund = decideCustomerSmartAvailabilityGate({
    enforce: true,
    booking: {
      pickupLabel: bfsToCity.pickupLabel,
      dropoffLabel: bfsToCity.dropoffLabel,
      tripDate: MONDAY,
      tripTime: "05:33",
      isRefundTest: true,
    },
    occupied: [larneAt0700],
    config,
    now: NOW,
  });
  assert.equal(refund.blocked, false);

  const gate = read("workers/addresses/src/smart-ops-handlers.ts");
  assert.match(gate, /export async function enforceCustomerSmartAvailabilityGate/);
  assert.match(gate, /previewWorkerEnforce: input.previewWorkerEnforce === true/);
  assert.match(gate, /shouldOfferCustomerAlternativeTimes/);
  assert.match(gate, /offerAlternatives:/);
  assert.match(gate, /catch \{\n    return allow;/);
  assert.match(gate, /Fail-open on unexpected errors/);

  const shadow = read("workers/addresses/src/smart-ops-handlers.ts");
  assert.match(shadow, /Fail-open: shadow must never break the live quote/);
  const quoteHandler = read("workers/addresses/src/quote-handlers.ts");
  assert.match(quoteHandler, /recordQuoteShadowSafely/);
  assert.match(quoteHandler, /enforceCustomerSmartAvailabilityGate/);
  assert.match(quoteHandler, /previewWorkerEnforce: env\.CUSTOMER_SMART_AVAILABILITY_PREVIEW_ENFORCE === "1"/);
  assert.match(quoteHandler, /previewWorkerEnforce: env\?\.CUSTOMER_SMART_AVAILABILITY_PREVIEW_ENFORCE === "1"/);
  assert.match(quoteHandler, /return json\(quoteBody, 200, origin\)/);
  assert.match(
    quoteHandler,
    /quoteBody\.smartAvailability = toPublicCustomerSmartAvailability/,
    "blocked quotes still return the fare; payment is the hard gate",
  );
  assert.doesNotMatch(
    quoteHandler,
    /reason: availabilityGate\.reason/,
    "customer quote payload must not include owner reason codes",
  );
  console.log("OK  missing fields / refund-test / shadow+gate failures stay fail-open");
}

console.log("\n=== Live 25-minute OSRM duration still matches Owner 05:32 / 05:33 ===");
{
  assert.equal(OWNER_AVAILABILITY_DEFAULT_DURATION_MINUTES, 30);
  const ownerPanel = read("src/components/OwnerSmartAvailabilityPanel.tsx");
  assert.match(ownerPanel, /durationMinutes:\s*"30"/);

  assert.equal(
    resolveCustomerAvailabilityDurationMinutes({ routeDurationMinutes: 25 }),
    30,
    "short live OSRM must floor to the Owner default, not change the engine",
  );
  assert.equal(
    resolveCustomerAvailabilityDurationMinutes({ routeDurationMinutes: 45 }),
    45,
    "longer live duration must stay longer",
  );
  assert.equal(
    resolveCustomerAvailabilityDurationMinutes({}),
    30,
    "missing live duration uses the Owner default, not the geo estimate",
  );
  const aligned = requestedJourneysFromCustomerBooking({
    pickupLabel: bfsToCity.pickupLabel,
    dropoffLabel: bfsToCity.dropoffLabel,
    tripDate: MONDAY,
    tripTime: "05:33",
    airportCode: "BFS",
    isFromAirport: true,
    routeDurationMinutes: 25,
    pickupLat: BFS.lat,
    pickupLng: BFS.lng,
    dropoffLat: BELFAST.lat,
    dropoffLng: BELFAST.lng,
  });
  assert.equal(aligned[0]?.durationMinutes, 30);

  const live25at0532 = decideCustomerSmartAvailabilityGate({
    enforce: true,
    booking: {
      pickupLabel: bfsToCity.pickupLabel,
      dropoffLabel: bfsToCity.dropoffLabel,
      tripDate: MONDAY,
      tripTime: "05:32",
      airportCode: "BFS",
      isFromAirport: true,
      routeDurationMinutes: 25,
      pickupLat: BFS.lat,
      pickupLng: BFS.lng,
      dropoffLat: BELFAST.lat,
      dropoffLng: BELFAST.lng,
    },
    occupied: [larneAt0700],
    config,
    now: NOW,
  });
  const live25at0533 = decideCustomerSmartAvailabilityGate({
    enforce: true,
    booking: {
      pickupLabel: bfsToCity.pickupLabel,
      dropoffLabel: bfsToCity.dropoffLabel,
      tripDate: MONDAY,
      tripTime: "05:33",
      airportCode: "BFS",
      isFromAirport: true,
      routeDurationMinutes: 25,
      pickupLat: BFS.lat,
      pickupLng: BFS.lng,
      dropoffLat: BELFAST.lat,
      dropoffLng: BELFAST.lng,
    },
    occupied: [larneAt0700],
    config,
    now: NOW,
  });
  assert.equal(live25at0532.blocked, false, "05:32 with live 25 min must stay bookable");
  assert.equal(live25at0533.blocked, true, "05:33 with live 25 min must match Owner 30 min");
  assert.equal(live25at0533.customerMessage, CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE);
  console.log("OK  customer wrapper floors 25 min to Owner 30 without changing the engine");
}

console.log("\n=== Alternative suggestions are engine-validated and preview-only ===");
{
  assert.equal(
    shouldOfferCustomerAlternativeTimes({
      alternativeTimeSuggestionsFlag: false,
      origin: "https://www.myairporttaxini.co.uk",
      previewRequested: true,
    }),
    false,
  );
  assert.equal(
    shouldOfferCustomerAlternativeTimes({
      alternativeTimeSuggestionsFlag: false,
      previewWorkerEnforce: true,
    }),
    true,
  );
  assert.equal(
    shouldOfferCustomerAlternativeTimes({
      alternativeTimeSuggestionsFlag: true,
    }),
    true,
  );

  const booking0533 = {
    pickupLabel: bfsToCity.pickupLabel,
    dropoffLabel: bfsToCity.dropoffLabel,
    tripDate: MONDAY,
    tripTime: "05:33",
    airportCode: "BFS" as const,
    isFromAirport: true,
    routeDurationMinutes: 25,
    pickupLat: BFS.lat,
    pickupLng: BFS.lng,
    dropoffLat: BELFAST.lat,
    dropoffLng: BELFAST.lng,
  };
  const withoutAlts = decideCustomerSmartAvailabilityGate({
    enforce: true,
    booking: booking0533,
    occupied: [larneAt0700],
    config,
    offerAlternatives: false,
    now: NOW,
  });
  assert.equal(withoutAlts.blocked, true);
  assert.equal(withoutAlts.alternativeTimes.length, 0);

  const withAlts = decideCustomerSmartAvailabilityGate({
    enforce: true,
    booking: booking0533,
    occupied: [larneAt0700],
    config,
    offerAlternatives: true,
    now: NOW,
  });
  assert.equal(withAlts.blocked, true);
  assert.equal(withAlts.customerMessage, customerUnavailableAtTimeMessage("05:33"));
  assert.equal(withAlts.customerMessage, "Unfortunately, we’re not available at 05:33.");
  assert.ok(withAlts.alternativeTimes.length >= 1, "unavailable 05:33 should offer nearby times");
  assert.ok(!withAlts.alternativeTimes.some((item) => item.tripTime === "05:33"));
  for (const option of withAlts.alternativeTimes) {
    const check = evaluateCustomerSmartAvailability({
      requested: { ...bfsToCity, tripDate: option.tripDate, tripTime: option.tripTime },
      occupied: [larneAt0700],
      config,
      searchAlternatives: false,
      now: NOW,
    });
    assert.equal(check.available, true, `${option.tripTime} must itself be available`);
    assert.doesNotMatch(option.tripTime, /reason|conflict|TAAA/i);
  }
  const publicAlts = toPublicCustomerSmartAvailability(withAlts);
  assert.equal("reason" in publicAlts, false);
  assert.equal("decision" in publicAlts, false);
  assert.ok(publicAlts.alternativeTimes.length === withAlts.alternativeTimes.length);
  for (const option of publicAlts.alternativeTimes) {
    assert.equal(Object.keys(option).sort().join(","), "tripDate,tripTime");
  }

  const selected = withAlts.alternativeTimes[0];
  const afterTap = decideCustomerSmartAvailabilityGate({
    enforce: true,
    booking: { ...booking0533, tripDate: selected.tripDate, tripTime: selected.tripTime },
    occupied: [larneAt0700],
    config,
    offerAlternatives: true,
    now: NOW,
  });
  assert.equal(afterTap.blocked, false, "tapping a suggested time must revalidate as available");
  assert.equal(afterTap.available, true);

  const blockedUi = read("src/components/CustomerSmartAvailabilityBlocked.tsx");
  assert.match(blockedUi, /CUSTOMER_OTHER_TIMES_HEADING/);
  assert.match(blockedUi, /CUSTOMER_CHOOSE_ANOTHER_TIME_LABEL/);
  assert.match(blockedUi, /CUSTOMER_WHATSAPP_SECONDARY_MESSAGE/);
  assert.doesNotMatch(blockedUi, /BookingErrorWhatsAppHelp/);
  assert.doesNotMatch(blockedUi, /Get Booking Help on WhatsApp/);
  console.log("OK  alternatives are revalidated, public-only, and preview-gated");
}

console.log("\n=== 05:18 BFS alternative fits before 07:00 Larne ===");
{
  const requested = { ...bfsToCity, tripTime: "05:18" };
  const owner = evaluateSmartAvailability({
    requested,
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now: NOW,
  });
  const customer = evaluateCustomerSmartAvailability({
    requested,
    occupied: [larneAt0700],
    config,
    searchAlternatives: false,
    now: NOW,
  });
  assert.equal(customer.available, true);
  assert.equal(owner.available, true);
  assert.equal(owner.diagnostics.estimatedJourneyDurationMinutes, 30);
  assert.equal(owner.diagnostics.estimatedCompletionLocal, "2026-09-07T05:48");
  assert.equal(owner.diagnostics.expectedFinishingLocation, "Belfast City Centre");
  assert.equal(owner.diagnostics.positioningTravelMinutes, 48);
  assert.equal(owner.diagnostics.minTurnaroundMinutes, 10);
  assert.equal(owner.diagnostics.positioningNeededMinutes, 58);
  assert.equal(owner.diagnostics.earliestReadyLocal, "2026-09-07T06:46");
  assert.equal(owner.diagnostics.nextPickupLocal, "2026-09-07T07:00");
  assert.equal(owner.diagnostics.positioningGapMinutes, 72);
  assert.equal(owner.diagnostics.positioningGapMinutes! - owner.diagnostics.positioningNeededMinutes!, 14);
  const cityToLarne = repositionMinutes(BELFAST, LARNE, {
    fromLabel: "Belfast City Centre",
    toLabel: "12 Wyncairn Gardens, Larne BT40 2EB",
  });
  assert.equal(cityToLarne, 48);
  assert.equal(positioningTimeNeededMinutes(48, 10), 58);
  console.log("OK  05:18 finishes 05:48, 48+10=58 to Larne, ready 06:46, 14 min spare");
}

console.log("\n=== Preview opt-in enforces without Origin and never on www ===");
{
  assert.equal(isPagesPreviewOrigin("https://cursor-x.my-airport-taxi-ni-preview.pages.dev"), true);
  assert.equal(isPagesPreviewOrigin("https://www.myairporttaxini.co.uk"), false);
  assert.equal(isProductionCustomerOrigin("https://www.myairporttaxini.co.uk"), true);
  assert.equal(isProductionCustomerOrigin("https://myairporttaxini.co.uk"), true);
  assert.equal(isProductionCustomerOrigin(""), false);
  assert.equal(isProductionCustomerOrigin(null), false);
  assert.equal(
    shouldEnforceCustomerSmartAvailability({
      smartAvailabilityFlag: false,
      origin: "https://cursor-customer-smart-availability-gate-514b.my-airport-taxi-ni-preview.pages.dev",
      previewRequested: true,
    }),
    true,
  );
  assert.equal(
    shouldEnforceCustomerSmartAvailability({
      smartAvailabilityFlag: false,
      origin: "https://cursor-customer-smart-availability-gate-514b.my-airport-taxi-ni-preview.pages.dev",
      previewRequested: false,
    }),
    false,
  );
  assert.equal(
    shouldEnforceCustomerSmartAvailability({
      smartAvailabilityFlag: false,
      previewRequested: true,
    }),
    false,
    "missing Origin on the production Worker must stay fail-open",
  );
  assert.equal(
    shouldEnforceCustomerSmartAvailability({
      smartAvailabilityFlag: false,
      origin: "https://www.myairporttaxini.co.uk",
      previewRequested: true,
    }),
    false,
    "production www must ignore the preview header while the flag is off",
  );
  assert.equal(
    shouldEnforceCustomerSmartAvailability({
      smartAvailabilityFlag: false,
      previewRequested: false,
      previewWorkerEnforce: true,
    }),
    true,
    "isolated preview Worker env var enforces even without the query",
  );
  assert.equal(
    shouldEnforceCustomerSmartAvailability({
      smartAvailabilityFlag: false,
      origin: "https://www.myairporttaxini.co.uk",
      previewRequested: false,
      previewWorkerEnforce: false,
    }),
    false,
  );
  assert.equal(
    shouldEnforceCustomerSmartAvailability({
      smartAvailabilityFlag: false,
      origin: "https://my-airport-taxi-ni-quote.vercel.app",
      previewRequested: true,
    }),
    false,
    "Vercel preview must not turn on the production Worker",
  );
  const headers = new Headers({ "X-Smart-Availability-Preview": "1" });
  assert.equal(
    customerSmartAvailabilityPreviewRequested({
      headers,
      url: "https://reimagined-octo-meme.cgr28.workers.dev/payments",
    }),
    true,
  );
  assert.equal(
    customerSmartAvailabilityPreviewRequested({
      url: withCustomerSmartAvailabilityPreviewQuery(
        "https://reimagined-octo-meme.cgr28.workers.dev/payments",
      ),
    }),
    true,
  );
  assert.equal(
    customerSmartAvailabilityPreviewRequested({
      url: "https://reimagined-octo-meme.cgr28.workers.dev/payments",
    }),
    false,
  );
  console.log("OK  preview query/header/worker-env enforce; www stays off");
}

console.log("\n=== Public booking/payment routes cannot bypass the worker gate ===");
{
  const payments = read("workers/addresses/src/index.ts");
  assert.match(payments, /async function blockedCustomerSmartAvailabilityResponse/);
  assert.match(payments, /previewWorkerEnforce: env.CUSTOMER_SMART_AVAILABILITY_PREVIEW_ENFORCE === "1"/);
  assert.match(payments, /code: "smart_availability_unavailable"/);
  assert.match(payments, /whatsappAvailable: true/);
  assert.match(payments, /shortNoticeBlocked/);
  assert.match(payments, /a2aBlocked/);
  assert.match(payments, /quickQuoteBlocked/);
  assert.match(payments, /availabilityBlocked/);
  const shortNoticeGateIdx = payments.indexOf("shortNoticeBlocked");
  const shortNoticeReuseIdx = payments.indexOf(
    "Reuse an unpaid checkout when possible",
    shortNoticeGateIdx,
  );
  assert.ok(shortNoticeGateIdx > 0 && shortNoticeReuseIdx > shortNoticeGateIdx);
  const a2aGateIdx = payments.indexOf("a2aBlocked");
  const a2aReuseIdx = payments.indexOf("record.checkoutId && record.paymentUrl", a2aGateIdx);
  assert.ok(a2aGateIdx > 0 && a2aReuseIdx > a2aGateIdx);
  const qqGateIdx = payments.indexOf("quickQuoteBlocked");
  const qqReuseIdx = payments.indexOf(
    "Reuse unpaid checkout when present and amount still matches",
    qqGateIdx,
  );
  assert.ok(qqGateIdx > 0 && qqReuseIdx > qqGateIdx);

  const createPayment = read("src/lib/create-payment.ts");
  assert.match(createPayment, /customerSmartAvailabilityPreviewHeaders/);
  assert.match(createPayment, /withCustomerSmartAvailabilityPreviewUrl\(PAYMENTS_API_URL\)/);

  const publicPayClients = [
    "src/components/QuoteCard.tsx",
    "src/app/book-quote/BookQuoteCustomerClient.tsx",
    "src/app/personal-quote/PersonalQuoteCustomerClient.tsx",
    "src/app/quote/SavedQuoteCustomerClient.tsx",
    "src/app/pay/a2a-quote/A2aQuotePayClient.tsx",
    "src/app/pay/short-notice/ShortNoticePayClient.tsx",
  ];
  for (const rel of publicPayClients) {
    const src = read(rel);
    assert.match(src, /createPaymentCheckout/, `${rel} must start SumUp via /payments`);
    assert.match(
      src,
      /isCustomerSmartAvailabilityBlockMessage/,
      `${rel} must hide Pay when the journey is unavailable`,
    );
  }
  assert.match(
    read("src/app/book-quote/BookQuoteCustomerClient.tsx"),
    /useCustomerSmartAvailabilityPreflight/,
  );
  assert.match(
    read("src/app/quote/SavedQuoteCustomerClient.tsx"),
    /useCustomerSmartAvailabilityPreflight/,
  );
  assert.match(
    read("src/app/personal-quote/PersonalQuoteCustomerClient.tsx"),
    /useCustomerSmartAvailabilityPreflight/,
  );

  const a2a = read("src/app/pay/a2a-quote/A2aQuotePayClient.tsx");
  assert.doesNotMatch(
    a2a,
    /window\.location\.assign\(summary\.paymentUrl\)/,
    "A2A must not skip /payments with a prebuilt SumUp URL",
  );

  const quoteCard = read("src/components/QuoteCard.tsx");
  assert.doesNotMatch(quoteCard, /evaluateSmartAvailability/);
  assert.match(quoteCard, /checkCustomerSmartAvailability/);
  assert.match(quoteCard, /smartAvailabilityBlocked/);
  assert.match(quoteCard, /!smartAvailabilityBlocked/);
  assert.match(quoteCard, /CustomerSmartAvailabilityBlocked/);
  assert.match(quoteCard, /handleSelectAvailabilityAlternative/);
  assert.match(quoteCard, /handleChooseAnotherTime/);
  assert.match(quoteCard, /smartAvailabilityBlocked \? null/);
  assert.match(quoteCard, /Continue to your details/);
  assert.match(quoteCard, /isCustomerSmartAvailabilityBlockMessage\(paymentError\)/);
  assert.match(quoteCard, /planJourneyDirectionDependentReset/);
  assert.match(quoteCard, /QUOTE_REQUIRED_FIELD_MESSAGES/);
  assert.match(quoteCard, /renderBookingErrorHelp\("payment-actions"\)/);
  assert.match(
    quoteCard,
    /Unfortunately, we’re not available at that time|isCustomerSmartAvailabilityBlockMessage/,
  );
  assert.doesNotMatch(quoteCard, /decision\.reason|availabilityGate\.reason/);

  const availabilityClient = read("src/lib/customer-smart-availability-client.ts");
  assert.match(availabilityClient, /sessionStorage/);
  assert.match(availabilityClient, /\/quote\/availability/);
  assert.match(availabilityClient, /Fail-open/);

  const quoteApi = read("src/lib/quick-quote-api.ts");
  assert.match(quoteApi, /smartAvailability/);
  assert.doesNotMatch(quoteApi, /smartRaw\.reason/);

  const cors = read("shared/google-places.ts");
  assert.match(cors, /X-Smart-Availability-Preview/);

  const srcFiles = [
    "src/lib/create-payment.ts",
    "src/lib/quick-quote-api.ts",
    "src/lib/a2a-quote-api.ts",
    "src/lib/personal-quote-api.ts",
    "src/lib/saved-quote-api.ts",
    "src/lib/short-notice-api.ts",
    "src/lib/booking-amendment-api.ts",
  ];
  for (const rel of srcFiles) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /evaluateSmartAvailability\(/,
      `${rel} must not grow a second availability algorithm`,
    );
  }
  console.log("OK  every public Pay path hits the same /payments gate");
}

console.log("\n=== Quote/payment behaviour is unchanged when the gate is off ===");
{
  const quoteHandler = read("workers/addresses/src/quote-handlers.ts");
  assert.match(quoteHandler, /if \(availabilityGate\.enforce\) \{\n      quoteBody\.smartAvailability/);
  assert.match(quoteHandler, /export async function handleQuoteAvailabilityRequest/);
  assert.doesNotMatch(quoteHandler, /return json\(\{[\s\S]*smart_availability_unavailable/);
  const paymentsIndex = read("workers/addresses/src/index.ts");
  assert.match(paymentsIndex, /\/quote\/availability/);
  assert.match(paymentsIndex, /handleQuoteAvailabilityRequest/);
  const payments = read("workers/addresses/src/index.ts");
  assert.match(payments, /createSumUpHostedCheckout\(/);
  const confirm = payments.lastIndexOf("createSumUpHostedCheckout(");
  const gate = payments.lastIndexOf("availabilityBlocked");
  assert.ok(gate > 0 && confirm > gate, "SumUp checkout is created only after the availability gate");
  console.log("OK  quotes still price when blocked; SumUp is created only after the gate");
}

console.log("\n=== Preview Worker is isolated from production ===");
{
  const wrangler = read("workers/addresses/wrangler.toml");
  assert.match(wrangler, /\[env\.preview\]/);
  assert.match(wrangler, /name = "reimagined-octo-meme-sa-preview"/);
  const preview = wrangler.slice(wrangler.indexOf("[env.preview]"));
  assert.doesNotMatch(preview, /crons/);
  assert.match(preview, /CUSTOMER_SMART_AVAILABILITY_PREVIEW_ENFORCE = "1"/);
  const productionVars = wrangler.slice(wrangler.indexOf("[vars]"), wrangler.indexOf("[triggers]"));
  assert.doesNotMatch(
    productionVars,
    /CUSTOMER_SMART_AVAILABILITY_PREVIEW_ENFORCE/,
    "production [vars] must not enable the preview enforce switch",
  );
  const workflow = read(".github/workflows/deploy-pages-preview.yml");
  assert.match(workflow, /wrangler deploy --env preview/);
  assert.match(workflow, /preview-worker:/);
  assert.doesNotMatch(workflow, /wrangler deploy --env production|npm run deploy/);
  console.log("OK  preview Worker has no cron and is not the production deploy");
}

console.log("\nAll customer Smart Availability gate checks passed.");
