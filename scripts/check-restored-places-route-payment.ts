/**
 * Returning-customer place restore + route reconfirmation before SumUp.
 * Run: npx tsx scripts/check-restored-places-route-payment.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ROUTE_RECONFIRMATION_CODE,
  ROUTE_RECONFIRMATION_MESSAGE,
  addressTextMatchesPlace,
  buildRouteReconfirmationPaymentError,
  isQuoteReadyRestorablePlace,
  resolveRouteMetricsWithRetry,
  restoredPlacesReadyForPayment,
} from "../shared/route-reconfirmation";

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

const readyPlace = {
  placeId: "ChIJpickup",
  formattedAddress: "10 High Street, Belfast BT1 2AB, UK",
  displayAddress: "10 High Street, Belfast BT1 2AB, UK",
  lat: 54.5964,
  lng: -5.9301,
  countryCode: "GB",
  postalCode: "BT1 2AB",
};

const readyDropoff = {
  placeId: "ChIJdropoff",
  formattedAddress: "Boucher Playing Fields, Belfast BT12, UK",
  displayAddress: "Boucher Playing Fields, Belfast BT12, UK",
  lat: 54.58,
  lng: -5.96,
  countryCode: "GB",
  postalCode: "BT12",
};

const textOnly = {
  placeId: "",
  formattedAddress: "10 High Street, Belfast",
  displayAddress: "10 High Street, Belfast",
  lat: null,
  lng: null,
};

async function main() {
  await check("1. leaving and returning with valid saved place data", () => {
    assert.equal(isQuoteReadyRestorablePlace(readyPlace), true);
    assert.equal(
      addressTextMatchesPlace(readyPlace.displayAddress!, readyPlace),
      true,
    );
    assert.equal(
      restoredPlacesReadyForPayment({
        pickupAddress: readyPlace.displayAddress!,
        dropoffAddress: readyDropoff.displayAddress!,
        pickupPlace: readyPlace,
        dropoffPlace: readyDropoff,
      }),
      true,
    );
  });

  await check("2. restored address text without place data is not confirmed", () => {
    assert.equal(isQuoteReadyRestorablePlace(textOnly), false);
    assert.equal(
      addressTextMatchesPlace("10 High Street, Belfast", textOnly),
      false,
    );
    assert.equal(
      restoredPlacesReadyForPayment({
        pickupAddress: "10 High Street, Belfast",
        dropoffAddress: readyDropoff.displayAddress!,
        pickupPlace: null,
        dropoffPlace: readyDropoff,
      }),
      false,
    );
    assert.equal(
      restoredPlacesReadyForPayment({
        pickupAddress: "10 High Street, Belfast",
        dropoffAddress: readyDropoff.displayAddress!,
        pickupPlace: textOnly,
        dropoffPlace: readyDropoff,
      }),
      false,
    );
  });

  await check("3. edited address after restoration clears confirmation match", () => {
    assert.equal(
      addressTextMatchesPlace("99 Completely Different Road, Belfast", readyPlace),
      false,
    );
    assert.equal(
      restoredPlacesReadyForPayment({
        pickupAddress: "99 Completely Different Road, Belfast",
        dropoffAddress: readyDropoff.displayAddress!,
        pickupPlace: readyPlace,
        dropoffPlace: readyDropoff,
      }),
      false,
    );
  });

  await check("4. temporary route-service failure retries once then returns null", async () => {
    let attempts = 0;
    const failed = await resolveRouteMetricsWithRetry(async () => {
      attempts += 1;
      return null;
    });
    assert.equal(failed, null);
    assert.equal(attempts, 2);

    attempts = 0;
    const recovered = await resolveRouteMetricsWithRetry(async () => {
      attempts += 1;
      if (attempts === 1) return null;
      return { distanceKm: 12, durationMinutes: 20 };
    });
    assert.deepEqual(recovered, { distanceKm: 12, durationMinutes: 20 });
    assert.equal(attempts, 2);
  });

  await check("5. SumUp only after successful route + fare validation wiring", () => {
    const err = buildRouteReconfirmationPaymentError();
    assert.equal(err.code, ROUTE_RECONFIRMATION_CODE);
    assert.equal(err.error, ROUTE_RECONFIRMATION_MESSAGE);

    const index = fs.readFileSync(
      path.join(root, "workers/addresses/src/index.ts"),
      "utf8",
    );
    assert.match(index, /resolveRouteOutcomeWithRetry|resolveWorkerTripRouteMetricsForPayment/);
    assert.match(index, /paymentErrorForRouteFailure|buildRouteReconfirmationPaymentError/);
    // Still never trust client route metrics / lat/lng for SumUp fare authority.
    assert.match(index, /Never trust body\.routeMetrics/);
    assert.match(index, /pickupPlaceId|dropoffPlaceId/);
    assert.match(index, /trustClientCoordinates:\s*false|client lat\/lng/);

    const shared = fs.readFileSync(
      path.join(root, "shared/route-reconfirmation.ts"),
      "utf8",
    );
    assert.match(shared, /route_reconfirmation_required/);
    assert.match(shared, /route_service_unavailable/);
    assert.match(shared, /resolveRouteOutcomeWithRetry|resolveRouteMetricsWithRetry/);

    const createPayment = fs.readFileSync(
      path.join(root, "src/lib/create-payment.ts"),
      "utf8",
    );
    assert.match(createPayment, /isPaymentRouteReconfirmationError/);
    assert.match(createPayment, /isPaymentRouteServiceUnavailableError/);
    assert.match(createPayment, /route_reconfirmation_required/);
    assert.match(createPayment, /pickupPlaceId/);
    assert.match(createPayment, /dropoffPlaceId/);

    const card = fs.readFileSync(path.join(root, "src/components/QuoteCard.tsx"), "utf8");
    assert.match(card, /routeReconfirmationRequired/);
    assert.match(card, /routeValidationBlockingPayment/);
    assert.match(card, /requireConfirmedPlacesForPayment/);
    assert.match(card, /isPaymentRouteReconfirmationError/);
    assert.match(card, /isPaymentRouteServiceUnavailableError/);
    assert.match(card, /ROUTE_RECONFIRMATION_MESSAGE/);
    assert.match(card, /clearStaleRouteAndPriceAfterAddressEdit/);
    // Payment disabled while route validation errors present.
    assert.match(card, /routeValidationBlockingPayment/);
    assert.doesNotMatch(
      card,
      /if \(savedPickup && !keepInitialPickup\) \{\s*setPickupAddress\(savedPickup\)/,
    );

    const draft = fs.readFileSync(
      path.join(root, "src/lib/booking-draft-storage.ts"),
      "utf8",
    );
    assert.match(draft, /isQuoteReadyPlace/);
    assert.match(draft, /pickupPlace/);
    assert.match(draft, /dropoffPlace/);
  });

  console.log("\nAll restored-places route payment checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
