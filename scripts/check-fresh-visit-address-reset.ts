/**
 * Fresh-visit address reset: leaving the quote site and coming back
 * must start with empty pickup/destination fields.
 * Run: npx tsx scripts/check-fresh-visit-address-reset.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isQuoteReadyPlace, type SelectedPlace } from "../src/lib/selected-place";
import {
  applyQuoteAddressResetDecision,
  blankVisibleQuoteAddressFields,
  clearStoredQuoteAddresses,
  decideQuoteAddressReset,
  decideQuoteAddressResetFromPageShow,
  FRESH_VISIT_ADDRESS_STORAGE_KEYS,
  isProtectedPaymentReturnContext,
  readLeftoverStoredQuoteAddresses,
  resolveAddressesForFreshVisit,
  type QuoteAddressSessionSnapshot,
} from "../src/lib/fresh-visit-address-reset";
import {
  readBookingFormDraft,
  saveBookingFormDraft,
  saveOpenCheckoutSession,
} from "../src/lib/booking-draft-storage";
import {
  PICKUP_ADDRESS_STORAGE_KEY,
  DROPOFF_ADDRESS_STORAGE_KEY,
  PICKUP_PLACE_STORAGE_KEY,
  DROPOFF_PLACE_STORAGE_KEY,
  saveConfirmedPickupPlace,
  saveConfirmedDropoffPlace,
  savePickupAddressLabel,
  saveDropoffAddressLabel,
} from "../src/lib/address-place-storage";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const readyPickup: SelectedPlace = {
  placeId: "ChIJpickupFresh",
  formattedAddress: "10 High Street, Belfast BT1 2AB, UK",
  displayAddress: "10 High Street, Belfast BT1 2AB, UK",
  placeName: null,
  lat: 54.5964,
  lng: -5.9301,
  countryCode: "GB",
  postalCode: "BT1 2AB",
};

const readyDropoff: SelectedPlace = {
  placeId: "ChIJdropoffFresh",
  formattedAddress: "Belfast International Airport, Belfast BT29 4AB, UK",
  displayAddress: "Belfast International Airport, Belfast BT29 4AB, UK",
  placeName: "Belfast International Airport",
  lat: 54.6575,
  lng: -6.2158,
  countryCode: "GB",
  postalCode: "BT29 4AB",
};

const staleSnapshot: QuoteAddressSessionSnapshot = {
  pickupAddress: readyPickup.displayAddress!,
  dropoffAddress: readyDropoff.displayAddress!,
  pickupPlace: readyPickup,
  dropoffPlace: readyDropoff,
  routeMetrics: { distanceKm: 18.4, durationMinutes: 28 },
  calculatedQuote: { amount: 42 },
  passengers: 2,
  suitcases: 3,
  airportDirection: "to-airport",
  airportCode: "BFS",
};

function installMemoryStorage() {
  const local: Record<string, string> = {};
  const session: Record<string, string> = {};

  const makeStorage = (store: Record<string, string>): Storage => ({
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: () => null,
    length: 0,
  });

  (globalThis as { window?: unknown }).window = globalThis;
  (globalThis as { localStorage: Storage }).localStorage = makeStorage(local);
  (globalThis as { sessionStorage: Storage }).sessionStorage = makeStorage(session);

  return { local, session };
}

function seedStaleAddresses() {
  saveConfirmedPickupPlace(readyPickup);
  saveConfirmedDropoffPlace(readyDropoff);
  savePickupAddressLabel(readyPickup.displayAddress!);
  saveDropoffAddressLabel(readyDropoff.displayAddress!);
  saveBookingFormDraft({
    quoteStep: 3,
    pickupAddress: readyPickup.displayAddress,
    dropoffAddress: readyDropoff.displayAddress,
    pickupPlace: readyPickup,
    dropoffPlace: readyDropoff,
    passengers: 2,
    suitcases: 3,
    journeyIntent: "to-airport",
    intentAirportCode: "BFS",
    customerName: "Ada Example",
    customerEmail: "ada@example.com",
  });
  localStorage.setItem(
    "matni-pending-payment",
    JSON.stringify({ checkoutId: "chk_keep", booking: { customerName: "Ada Example" } }),
  );
  localStorage.setItem("matni-payment-confirmed-chk_keep", "1");
  saveOpenCheckoutSession({
    paymentUrl: "https://checkout.sumup.com/example",
    checkoutId: "chk_keep",
    amountLabel: "£42",
    openedAt: "2026-09-09T08:00:00.000Z",
  });
}

console.log("=== 1. Fresh visit begins with blank address fields ===");
{
  const resolved = resolveAddressesForFreshVisit({
    storedPickupLabel: readyPickup.displayAddress,
    storedDropoffLabel: readyDropoff.displayAddress,
    storedPickupPlace: readyPickup,
    storedDropoffPlace: readyDropoff,
    draft: {
      pickupAddress: readyPickup.displayAddress,
      dropoffAddress: readyDropoff.displayAddress,
      pickupPlace: readyPickup,
      dropoffPlace: readyDropoff,
    },
  });
  assert.equal(resolved.pickupAddress, "");
  assert.equal(resolved.dropoffAddress, "");
  assert.equal(resolved.pickupPlace, null);
  assert.equal(resolved.dropoffPlace, null);

  const fresh = decideQuoteAddressReset({ trigger: "fresh-load", pathname: "/", search: "" });
  assert.equal(fresh.clearStoredAddresses, true);
  assert.equal(fresh.blankVisibleAddressFields, false);
  assert.equal(fresh.reason, "fresh-visit");
  console.log("OK  leftover storage cannot populate a new visit");
}

console.log("\n=== 2. Stored address text and structured places cannot reappear ===");
{
  const { local, session } = installMemoryStorage();
  seedStaleAddresses();
  assert.equal(isQuoteReadyPlace(readyPickup), true);
  assert.ok(local[PICKUP_ADDRESS_STORAGE_KEY]);
  assert.ok(local[PICKUP_PLACE_STORAGE_KEY]);
  assert.ok(local[DROPOFF_ADDRESS_STORAGE_KEY]);
  assert.ok(local[DROPOFF_PLACE_STORAGE_KEY]);
  assert.ok(session["matni-booking-draft-v1"]);

  clearStoredQuoteAddresses();

  const leftover = readLeftoverStoredQuoteAddresses();
  assert.equal(leftover.pickupLabel, "");
  assert.equal(leftover.dropoffLabel, "");
  assert.equal(leftover.pickupPlace, null);
  assert.equal(leftover.dropoffPlace, null);
  assert.equal(leftover.draftPickupAddress, "");
  assert.equal(leftover.draftDropoffAddress, "");
  assert.equal(leftover.draftPickupPlace, null);
  assert.equal(leftover.draftDropoffPlace, null);

  const draft = readBookingFormDraft();
  assert.ok(draft);
  assert.equal(draft?.passengers, 2);
  assert.equal(draft?.suitcases, 3);
  assert.equal(draft?.intentAirportCode, "BFS");
  assert.equal(draft?.customerName, "Ada Example");
  assert.equal(local["matni-pending-payment"]?.includes("chk_keep"), true);
  assert.equal(local["matni-payment-confirmed-chk_keep"], "1");
  assert.ok(session["matni-open-checkout-v1"]);
  console.log("OK  address keys wiped; passengers, airport and payment markers kept");
}

console.log("\n=== 3. Old route metrics and calculated prices are invalidated ===");
{
  const cleared = blankVisibleQuoteAddressFields(staleSnapshot);
  assert.equal(cleared.pickupAddress, "");
  assert.equal(cleared.dropoffAddress, "");
  assert.equal(cleared.pickupPlace, null);
  assert.equal(cleared.dropoffPlace, null);
  assert.equal(cleared.routeMetrics, null);
  assert.equal(cleared.calculatedQuote, null);
  assert.equal(cleared.passengers, 2);
  assert.equal(cleared.suitcases, 3);
  assert.equal(cleared.airportDirection, "to-airport");
  assert.equal(cleared.airportCode, "BFS");
  console.log("OK  route/price cleared; airport direction and party kept");
}

console.log("\n=== 4. Switching tabs does not clear an active address ===");
{
  const decision = decideQuoteAddressReset({ trigger: "visibility-change" });
  assert.equal(decision.clearStoredAddresses, false);
  assert.equal(decision.blankVisibleAddressFields, false);
  assert.equal(decision.reason, "visibility-change");
  const kept = applyQuoteAddressResetDecision(staleSnapshot, decision);
  assert.equal(kept.pickupAddress, staleSnapshot.pickupAddress);
  assert.equal(kept.dropoffAddress, staleSnapshot.dropoffAddress);
  assert.deepEqual(kept.routeMetrics, staleSnapshot.routeMetrics);
  assert.deepEqual(kept.calculatedQuote, staleSnapshot.calculatedQuote);
  console.log("OK  visibility change leaves the active quote addresses alone");
}

console.log("\n=== 5. Ordinary booking-step navigation does not clear addresses ===");
{
  const decision = decideQuoteAddressReset({ trigger: "quote-step-navigation" });
  assert.equal(decision.clearStoredAddresses, false);
  assert.equal(decision.blankVisibleAddressFields, false);
  const kept = applyQuoteAddressResetDecision(staleSnapshot, decision);
  assert.equal(kept.pickupPlace?.placeId, readyPickup.placeId);
  assert.equal(kept.dropoffPlace?.placeId, readyDropoff.placeId);
  assert.equal(kept.calculatedQuote?.amount, 42);

  const rerender = decideQuoteAddressReset({ trigger: "react-rerender" });
  assert.equal(rerender.blankVisibleAddressFields, false);
  console.log("OK  step changes and rerenders keep the current selection");
}

console.log("\n=== 6. Browser-restored quote page clears stale addresses ===");
{
  const bfcache = decideQuoteAddressResetFromPageShow({
    persisted: true,
    pathname: "/",
    search: "",
  });
  assert.equal(bfcache.clearStoredAddresses, true);
  assert.equal(bfcache.blankVisibleAddressFields, true);
  assert.equal(bfcache.reason, "bfcache-restore");
  const restored = applyQuoteAddressResetDecision(staleSnapshot, bfcache);
  assert.equal(restored.pickupAddress, "");
  assert.equal(restored.dropoffAddress, "");
  assert.equal(restored.routeMetrics, null);
  assert.equal(restored.calculatedQuote, null);
  assert.equal(restored.passengers, 2);
  assert.equal(restored.airportCode, "BFS");

  const normalShow = decideQuoteAddressResetFromPageShow({
    persisted: false,
    pathname: "/",
    search: "",
  });
  assert.equal(normalShow.blankVisibleAddressFields, false);
  assert.equal(normalShow.reason, "active-session");
  console.log("OK  pageshow persisted blanks addresses; ordinary pageshow does not");
}

console.log("\n=== 7. Paid-payment return and confirmation stay unaffected ===");
{
  assert.equal(
    isProtectedPaymentReturnContext({ pathname: "/", search: "?payment=return" }),
    true,
  );
  assert.equal(
    isProtectedPaymentReturnContext({
      pathname: "/booking-confirmed/",
      search: "?return_token=abc",
    }),
    true,
  );
  assert.equal(
    isProtectedPaymentReturnContext({ pathname: "/", search: "?checkout_id=chk_1" }),
    true,
  );
  assert.equal(isProtectedPaymentReturnContext({ pathname: "/", search: "" }), false);

  const paymentReturn = decideQuoteAddressReset({
    trigger: "fresh-load",
    pathname: "/",
    search: "?payment=return&return_token=abc",
  });
  assert.equal(paymentReturn.clearStoredAddresses, false);
  assert.equal(paymentReturn.blankVisibleAddressFields, false);
  assert.equal(paymentReturn.reason, "payment-return");

  const confirmedPage = decideQuoteAddressResetFromPageShow({
    persisted: true,
    pathname: "/booking-confirmed/",
    search: "",
  });
  assert.equal(confirmedPage.clearStoredAddresses, false);
  assert.equal(confirmedPage.blankVisibleAddressFields, false);
  assert.equal(confirmedPage.reason, "payment-return");

  const kept = applyQuoteAddressResetDecision(staleSnapshot, paymentReturn);
  assert.equal(kept.pickupAddress, staleSnapshot.pickupAddress);
  assert.deepEqual(kept.calculatedQuote, staleSnapshot.calculatedQuote);

  assert.ok(FRESH_VISIT_ADDRESS_STORAGE_KEYS.preserved.includes("matni-pending-payment"));
  assert.ok(
    FRESH_VISIT_ADDRESS_STORAGE_KEYS.preservedPrefixes.includes("matni-payment-confirmed-"),
  );
  console.log("OK  SumUp return + booking-confirmed never wipe addresses or payment state");
}

console.log("\n=== QuoteCard / confirmation wiring ===");
{
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /decideQuoteAddressReset/);
  assert.match(card, /decideQuoteAddressResetFromPageShow/);
  assert.match(card, /clearStoredQuoteAddresses/);
  assert.match(card, /addEventListener\("pageshow"/);
  assert.match(card, /event\.persisted/);
  assert.match(card, /blankQuoteAddressesAfterBrowserRestore/);
  assert.match(card, /applyNonAddressDraftFields/);
  assert.doesNotMatch(card, /readConfirmedPickupPlace/);
  assert.doesNotMatch(card, /addEventListener\("visibilitychange"/);
  assert.match(card, /payment"\) !== "return"/);
  assert.match(card, /booking-confirmed/);

  const confirmed = read("src/app/booking-confirmed/BookingConfirmedClient.tsx");
  assert.doesNotMatch(confirmed, /clearStoredQuoteAddresses/);
  assert.doesNotMatch(confirmed, /blankQuoteAddressesAfterBrowserRestore/);
  assert.match(confirmed, /finalizePaidBookingFromUrl/);
  assert.match(confirmed, /hasPaymentReturn/);
  assert.match(confirmed, /readPendingPayment/);

  const finalize = read("src/lib/finalize-paid-booking.ts");
  assert.doesNotMatch(finalize, /clearStoredQuoteAddresses/);
  assert.match(finalize, /finalizePaidBookingFromUrl/);
  assert.match(finalize, /isPaymentReturnSearch/);

  const draft = read("src/lib/booking-draft-storage.ts");
  assert.match(draft, /stripAddressesFromBookingFormDraft/);
  console.log("OK  quote page uses pageshow reset; payment confirmation is untouched");
}

console.log("\nAll fresh-visit address reset checks passed.");
