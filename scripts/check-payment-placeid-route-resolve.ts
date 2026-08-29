/**
 * Payment route resolution: place IDs → server coords → OSRM.
 * Distinguishes invalid selections from temporary Google/OSRM failures.
 * Run: npx tsx scripts/check-payment-placeid-route-resolve.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ROUTE_RECONFIRMATION_CODE,
  ROUTE_RECONFIRMATION_MESSAGE,
  ROUTE_SERVICE_UNAVAILABLE_CODE,
  ROUTE_SERVICE_UNAVAILABLE_MESSAGE,
  buildRouteReconfirmationPaymentError,
  buildRouteServiceUnavailablePaymentError,
  paymentErrorForRouteFailure,
  resolveRouteOutcomeWithRetry,
  restoredPlacesReadyForPayment,
} from "../shared/route-reconfirmation";
import {
  resolveTripRouteMetricsOutcome,
  type RouteResolveOutcome,
} from "../shared/route-metrics-resolver";
import { SERVED_AIRPORTS } from "../shared/served-airports";

const root = path.resolve(import.meta.dirname, "..");

function check(label: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => console.log(`OK  ${label}`))
    .catch((error) => {
      console.error(`FAIL  ${label}`);
      throw error;
    });
}

const CITY_HALL = {
  placeId: "ChIJcityhall",
  formattedAddress: "Belfast City Hall, Belfast BT1 5GS, UK",
  displayAddress: "Belfast City Hall, Belfast BT1 5GS, UK",
  lat: 54.5964,
  lng: -5.9301,
};

const bfs = SERVED_AIRPORTS.find((a) => a.code === "BFS")!;
const bhd = SERVED_AIRPORTS.find((a) => a.code === "BHD")!;
const dub = SERVED_AIRPORTS.find((a) => a.code === "DUB")!;
const ldy = SERVED_AIRPORTS.find((a) => a.code === "LDY")!;

async function main() {
  await check("1. fresh selection: place IDs resolve via server lookup → OSRM metrics", async () => {
    const placeCoords = new Map([
      [CITY_HALL.placeId, { lat: CITY_HALL.lat, lng: CITY_HALL.lng }],
      [bfs.placeId, { lat: bfs.lat, lng: bfs.lng }],
    ]);
    let placeLookups = 0;
    let osrmCalls = 0;
    const outcome = await resolveTripRouteMetricsOutcome({
      pickupAddress: CITY_HALL.displayAddress,
      dropoffAddress: bfs.formattedAddress,
      pickupPlaceId: CITY_HALL.placeId,
      dropoffPlaceId: bfs.placeId,
      trustClientCoordinates: false,
      geocode: async () => {
        throw new Error("geocode must not be required when place IDs resolve");
      },
      resolvePlaceId: async (placeId) => {
        placeLookups += 1;
        const point = placeCoords.get(placeId) ?? null;
        return { point };
      },
      fetchRouteMetrics: async (olat, olng, dlat, dlng) => {
        osrmCalls += 1;
        assert.equal(olat, CITY_HALL.lat);
        assert.equal(olng, CITY_HALL.lng);
        // BFS uses served-airport catalogue — resolvePlaceId not required for BFS id
        assert.ok(Number.isFinite(dlat) && Number.isFinite(dlng));
        return { distanceKm: 22.5, durationMinutes: 25, source: "osrm" };
      },
    });
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.equal(outcome.metrics.distanceKm, 22.5);
      assert.equal(outcome.metrics.source, "osrm");
    }
    assert.equal(osrmCalls, 1);
    // BFS placeId hits catalogue before resolvePlaceId; City Hall uses resolvePlaceId.
    assert.ok(placeLookups >= 1);
  });

  await check("2. served airports BFS/BHD/DUB/LDY use catalogue coords (no Google call)", async () => {
    for (const airport of [bfs, bhd, dub, ldy]) {
      let googleCalls = 0;
      const outcome = await resolveTripRouteMetricsOutcome({
        pickupAddress: CITY_HALL.displayAddress,
        dropoffAddress: airport.formattedAddress,
        pickupPlaceId: CITY_HALL.placeId,
        dropoffPlaceId: airport.placeId,
        trustClientCoordinates: false,
        geocode: async () => null,
        resolvePlaceId: async (placeId) => {
          if (placeId === CITY_HALL.placeId) {
            return { point: { lat: CITY_HALL.lat, lng: CITY_HALL.lng } };
          }
          googleCalls += 1;
          return { point: null };
        },
        fetchRouteMetrics: async (_o, _og, dlat, dlng) => {
          assert.equal(dlat, airport.lat);
          assert.equal(dlng, airport.lng);
          return { distanceKm: 10, durationMinutes: 15, source: "osrm" };
        },
      });
      assert.equal(outcome.ok, true, airport.code);
      assert.equal(googleCalls, 0, `${airport.code} must not call Google for catalogue placeId`);
    }
  });

  await check("3. from-airport journeys also use catalogue for pickup airport", async () => {
    const outcome = await resolveTripRouteMetricsOutcome({
      pickupAddress: bhd.formattedAddress,
      dropoffAddress: CITY_HALL.displayAddress,
      pickupPlaceId: bhd.placeId,
      dropoffPlaceId: CITY_HALL.placeId,
      trustClientCoordinates: false,
      geocode: async () => null,
      resolvePlaceId: async (placeId) => {
        if (placeId === CITY_HALL.placeId) {
          return { point: { lat: CITY_HALL.lat, lng: CITY_HALL.lng } };
        }
        return { point: null };
      },
      fetchRouteMetrics: async (olat, olng) => {
        assert.equal(olat, bhd.lat);
        assert.equal(olng, bhd.lng);
        return { distanceKm: 8, durationMinutes: 14, source: "osrm" };
      },
    });
    assert.equal(outcome.ok, true);
  });

  await check("4. payment never trusts client lat/lng alone (spoof protection)", async () => {
    const outcome = await resolveTripRouteMetricsOutcome({
      pickupAddress: "Short",
      dropoffAddress: "Also short",
      pickupPlaceId: "",
      dropoffPlaceId: "",
      trustClientCoordinates: false,
      pickupLat: 54.5,
      pickupLng: -5.9,
      dropoffLat: 54.6,
      dropoffLng: -6.2,
      geocode: async () => null,
      fetchRouteMetrics: async () => {
        throw new Error("OSRM must not run on spoofed coords without place resolution");
      },
    });
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.equal(outcome.reason, "place_unresolved");
    }
  });

  await check("5. text-label geocode remains fallback when place ID missing", async () => {
    let geocodeCalls = 0;
    const outcome = await resolveTripRouteMetricsOutcome({
      pickupAddress: CITY_HALL.displayAddress,
      dropoffAddress: bfs.formattedAddress,
      pickupPlaceId: "",
      dropoffPlaceId: bfs.placeId,
      trustClientCoordinates: false,
      geocode: async (address) => {
        geocodeCalls += 1;
        assert.match(address, /City Hall/i);
        return { lat: CITY_HALL.lat, lng: CITY_HALL.lng };
      },
      fetchRouteMetrics: async () => ({
        distanceKm: 22,
        durationMinutes: 24,
        source: "osrm",
      }),
    });
    assert.equal(outcome.ok, true);
    assert.equal(geocodeCalls, 1);
  });

  await check("6. temporary Google failure → provider_unavailable (not reselect)", async () => {
    const outcome = await resolveTripRouteMetricsOutcome({
      pickupAddress: CITY_HALL.displayAddress,
      dropoffAddress: bfs.formattedAddress,
      pickupPlaceId: CITY_HALL.placeId,
      dropoffPlaceId: bfs.placeId,
      trustClientCoordinates: false,
      geocode: async () => null,
      resolvePlaceId: async (placeId) => {
        if (placeId === CITY_HALL.placeId) {
          return { point: null, providerError: true };
        }
        return { point: null };
      },
      fetchRouteMetrics: async () => null,
    });
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.equal(outcome.reason, "provider_unavailable");
      const err = paymentErrorForRouteFailure(outcome.reason);
      assert.equal(err.code, ROUTE_SERVICE_UNAVAILABLE_CODE);
      assert.equal(err.error, ROUTE_SERVICE_UNAVAILABLE_MESSAGE);
    }
  });

  await check("7. OSRM down after valid coords → routing_unavailable", async () => {
    const outcome = await resolveTripRouteMetricsOutcome({
      pickupAddress: CITY_HALL.displayAddress,
      dropoffAddress: bfs.formattedAddress,
      pickupPlaceId: CITY_HALL.placeId,
      dropoffPlaceId: bfs.placeId,
      trustClientCoordinates: false,
      geocode: async () => null,
      resolvePlaceId: async (placeId) => {
        if (placeId === CITY_HALL.placeId) {
          return { point: { lat: CITY_HALL.lat, lng: CITY_HALL.lng } };
        }
        return { point: null };
      },
      fetchRouteMetrics: async () => null,
    });
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.equal(outcome.reason, "routing_unavailable");
      assert.equal(
        paymentErrorForRouteFailure(outcome.reason).code,
        ROUTE_SERVICE_UNAVAILABLE_CODE,
      );
    }
  });

  await check("8. unresolved place → route_reconfirmation_required", async () => {
    const outcome = await resolveTripRouteMetricsOutcome({
      pickupAddress: "Unknown lane that never matched",
      dropoffAddress: bfs.formattedAddress,
      pickupPlaceId: "ChIJbogus",
      dropoffPlaceId: bfs.placeId,
      trustClientCoordinates: false,
      geocode: async () => null,
      resolvePlaceId: async () => ({ point: null }),
      fetchRouteMetrics: async () => null,
    });
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.equal(outcome.reason, "place_unresolved");
      const err = paymentErrorForRouteFailure(outcome.reason);
      assert.equal(err.code, ROUTE_RECONFIRMATION_CODE);
      assert.equal(err.error, ROUTE_RECONFIRMATION_MESSAGE);
    }
  });

  await check("9. retry once on transient provider/OSRM failure", async () => {
    let attempts = 0;
    const recovered = await resolveRouteOutcomeWithRetry(async (): Promise<RouteResolveOutcome> => {
      attempts += 1;
      if (attempts === 1) {
        return { ok: false, reason: "routing_unavailable", endpoint: "route" };
      }
      return {
        ok: true,
        metrics: { distanceKm: 11, durationMinutes: 18, source: "osrm" },
      };
    });
    assert.equal(recovered.ok, true);
    assert.equal(attempts, 2);

    attempts = 0;
    const permanent = await resolveRouteOutcomeWithRetry(async (): Promise<RouteResolveOutcome> => {
      attempts += 1;
      return { ok: false, reason: "place_unresolved", endpoint: "pickup" };
    });
    assert.equal(permanent.ok, false);
    assert.equal(attempts, 1); // do not retry genuine invalid place
  });

  await check("10. restored journey still requires quote-ready places", () => {
    assert.equal(
      restoredPlacesReadyForPayment({
        pickupAddress: CITY_HALL.displayAddress,
        dropoffAddress: bfs.formattedAddress,
        pickupPlace: CITY_HALL,
        dropoffPlace: {
          placeId: bfs.placeId,
          formattedAddress: bfs.formattedAddress,
          displayAddress: bfs.formattedAddress,
          lat: bfs.lat,
          lng: bfs.lng,
        },
      }),
      true,
    );
    assert.equal(
      restoredPlacesReadyForPayment({
        pickupAddress: CITY_HALL.displayAddress,
        dropoffAddress: bfs.formattedAddress,
        pickupPlace: { ...CITY_HALL, placeId: "", lat: null, lng: null },
        dropoffPlace: {
          placeId: bfs.placeId,
          formattedAddress: bfs.formattedAddress,
          lat: bfs.lat,
          lng: bfs.lng,
        },
      }),
      false,
    );
  });

  await check("11. wiring: QuoteCard + create-payment + Worker pass place IDs", () => {
    const card = fs.readFileSync(path.join(root, "src/components/QuoteCard.tsx"), "utf8");
    assert.match(card, /pickupPlaceId:\s*pickupPlace\?\.placeId/);
    assert.match(card, /dropoffPlaceId:\s*dropoffPlace\?\.placeId/);
    assert.match(card, /isPaymentRouteServiceUnavailableError/);
    assert.match(card, /ROUTE_SERVICE_UNAVAILABLE_MESSAGE/);
    // Service blip must not force Step 1 reselect.
    assert.match(
      card,
      /isPaymentRouteServiceUnavailableError[\s\S]*setPaymentError[\s\S]*setPaymentLoading\(false\)/,
    );
    assert.match(card, /setPaymentError\(""\)/);

    const createPayment = fs.readFileSync(
      path.join(root, "src/lib/create-payment.ts"),
      "utf8",
    );
    assert.match(createPayment, /pickupPlaceId/);
    assert.match(createPayment, /dropoffPlaceId/);
    assert.match(createPayment, /route_service_unavailable/);
    assert.match(createPayment, /isPaymentRouteServiceUnavailableError/);

    const index = fs.readFileSync(
      path.join(root, "workers/addresses/src/index.ts"),
      "utf8",
    );
    assert.match(index, /resolveWorkerTripRouteMetricsForPayment/);
    assert.match(index, /body\.pickupPlaceId/);
    assert.match(index, /body\.dropoffPlaceId/);
    assert.match(index, /trustClientCoordinates:\s*false|Never trust[\s\S]*client lat\/lng/);
    assert.match(index, /route_service_unavailable|paymentErrorForRouteFailure/);
    // Still never trust client routeMetrics for SumUp fare authority.
    assert.match(index, /Never trust body\.routeMetrics/);

    const resolve = fs.readFileSync(
      path.join(root, "workers/addresses/src/resolve-route-metrics.ts"),
      "utf8",
    );
    assert.match(resolve, /resolveGooglePlaceLocation/);
    assert.match(resolve, /resolveIdealPostcodesDetails/);
    assert.match(resolve, /servedAirportFromPlaceId|resolveTripRouteMetricsOutcome/);

    assert.deepEqual(buildRouteReconfirmationPaymentError(), {
      error: ROUTE_RECONFIRMATION_MESSAGE,
      code: ROUTE_RECONFIRMATION_CODE,
    });
    assert.deepEqual(buildRouteServiceUnavailablePaymentError(), {
      error: ROUTE_SERVICE_UNAVAILABLE_MESSAGE,
      code: ROUTE_SERVICE_UNAVAILABLE_CODE,
    });
  });

  await check("12. mobile Safari payment UX still same-tab (no popup)", () => {
    const card = fs.readFileSync(path.join(root, "src/components/QuoteCard.tsx"), "utf8");
    assert.match(card, /Same-tab redirect/);
    assert.match(card, /window\.location\.assign\(checkout\.paymentUrl\)/);
    assert.doesNotMatch(card, /window\.open\(checkout\.paymentUrl/);
    // Payment button still gated on confirmed places + route.
    assert.match(card, /routeValidationBlockingPayment/);
  });

  console.log("\nAll payment place-ID route-resolve checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
